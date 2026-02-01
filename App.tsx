
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { QRCodeSVG } from 'https://esm.sh/qrcode.react';
import { GoogleGenAI, Type } from "@google/genai";
import { Business, GeoPoint, BusinessCategory, Coupon, UserRole, Promotion, Product } from './types.ts';

// Declaración para Leaflet (L está en el window)
declare const L: any;

// CONFIGURACIÓN SUPABASE
const SUPABASE_URL = 'https://zgsgdzuonyvqveydklfg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnc2dkenVvbnl2cXZleWRrbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjczMTIsImV4cCI6MjA4NTU0MzMxMn0.zkmAedF2ABBcfBND3XT3u2dVpEMGjJAfUQS7TvO_6YQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_LOCATION = { lat: 19.6468, lng: -99.2255 }; // Calle del Hambre - Izcalli

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
};

const isBusinessOpen = (apertura?: string, cierre?: string): boolean => {
  if (!apertura || !cierre) return true;
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [hA, mA] = apertura.split(':').map(Number);
  const [hC, mC] = cierre.split(':').map(Number);
  const openTime = hA * 60 + mA;
  const closeTime = hC * 60 + mC;
  if (closeTime < openTime) return currentTime >= openTime || currentTime <= closeTime;
  return currentTime >= openTime && currentTime <= closeTime;
};

const App: React.FC = () => {
  // --- ESTADO DE ROLES ---
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState<string>('geofencing');
  
  // --- ESTADO DE DATOS ---
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [metrics, setMetrics] = useState<{whatsapp: number, maps: number, views: number}>({ whatsapp: 0, maps: 0, views: 0 });
  const [userLocation, setUserLocation] = useState<GeoPoint>(DEFAULT_LOCATION);
  const [isGPSEnabled, setIsGPSEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPromoManager, setShowPromoManager] = useState(false);
  const [showMenuManager, setShowMenuManager] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  // --- ESTADO DE NOTIFICACIÓN RADAR ---
  const [activePromoNotif, setActivePromoNotif] = useState<{promo: Promotion, biz: Business} | null>(null);

  // Formulario de registro/edición
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({
    nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: DEFAULT_LOCATION, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00'
  });

  const [promoFormData, setPromoFormData] = useState<Partial<Promotion>>({
    mensaje: '¡Pasa por tu descuento!', radio_km: 2, frecuencia_horas: 4, activa: true, imagen_url: ''
  });

  const [productFormData, setProductFormData] = useState<Partial<Product>>({
    nombre: '', precio: 0, descripcion: '', categoria: 'General'
  });
  
  const mapRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- LOGICA DE MÉTRICAS ---
  const logMetric = async (bizId: string, eventType: 'whatsapp' | 'maps' | 'view') => {
    try {
      await supabase.from('metricas').insert([{ id_negocio: bizId, tipo_evento: eventType }]);
    } catch (e) {
      console.error("Error logging metric:", e);
    }
  };

  useEffect(() => {
    (window as any).selectBusinessFromMap = (id: string) => {
      logMetric(id, 'view');
      setSelectedBusinessId(id);
      setActiveTab('cupones');
    };
    (window as any).logMapsClick = (id: string) => logMetric(id, 'maps');
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'); 
  }, []);

  const fetchAllData = async () => {
    setIsSyncing(true);
    try {
      const [bRes, cRes, pRes, prRes] = await Promise.all([
        supabase.from('negocios').select('*'),
        supabase.from('cupones').select('*'),
        supabase.from('promociones').select('*'),
        supabase.from('productos').select('*')
      ]);
      
      const parsedBiz = (bRes.data || []).map(b => ({
        id: b.id, 
        nombre: b.nombre, 
        descripcion: b.descripcion, 
        coordenadas: { lat: b.lat, lng: b.lng }, 
        imagenMenu: b.imagen_menu || '', 
        categoria: b.categoria as BusinessCategory,
        telefono: b.telefono,
        hora_apertura: b.hora_apertura,
        hora_cierre: b.hora_cierre,
        owner_id: b.owner_id
      }));

      setBusinesses(parsedBiz);
      setPromotions(pRes.data || []);
      setProducts(prRes.data || []);
      setCoupons((cRes.data || []).map(c => ({
        id: c.id, 
        idNegocio: c.id_negocio, 
        descripcionDescuento: c.descripcion_descuento, 
        codigoQR: c.codigo_qr, 
        fechaExpiracion: c.fecha_expiracion
      })));

      if (userRole === 'PATROCINADOR' && parsedBiz.length > 0) {
        const myId = parsedBiz[0].id;
        setBizFormData(parsedBiz[0]);
        const { data: mData } = await supabase.from('metricas').select('tipo_evento').eq('id_negocio', myId);
        if (mData) {
          const counts = mData.reduce((acc: any, curr: any) => {
            acc[curr.tipo_evento] = (acc[curr.tipo_evento] || 0) + 1;
            return acc;
          }, { whatsapp: 0, maps: 0, view: 0 });
          setMetrics({ whatsapp: counts.whatsapp, maps: counts.maps, views: counts.view });
        }
        const myPromo = (pRes.data || []).find(p => p.id_negocio === myId);
        if (myPromo) setPromoFormData(myPromo);
      }
    } catch (e) {
      console.error("Error fetching data:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    setSaveStatus("Guardando...");
    try {
      const isUpdate = !!bizFormData.id;
      if (isUpdate) {
        const { error } = await supabase.from('negocios').update({
          nombre: bizFormData.nombre,
          descripcion: bizFormData.descripcion,
          imagen_menu: bizFormData.imagenMenu,
          telefono: bizFormData.telefono,
          hora_apertura: bizFormData.hora_apertura,
          hora_cierre: bizFormData.hora_cierre,
          categoria: bizFormData.categoria
        }).eq('id', bizFormData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('negocios').insert([{
          nombre: bizFormData.nombre,
          descripcion: bizFormData.descripcion,
          lat: bizFormData.coordenadas?.lat || DEFAULT_LOCATION.lat,
          lng: bizFormData.coordenadas?.lng || DEFAULT_LOCATION.lng,
          imagen_menu: bizFormData.imagenMenu,
          categoria: bizFormData.categoria,
          telefono: bizFormData.telefono,
          hora_apertura: bizFormData.hora_apertura,
          hora_cierre: bizFormData.hora_cierre
        }]);
        if (error) throw error;
      }
      setSaveStatus("¡Éxito!");
      setIsEditing(false);
      await fetchAllData();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus("Error: " + err.message);
    } finally { setIsSyncing(false); }
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizFormData.id) return;
    setIsSyncing(true);
    setSaveStatus("Lanzando promo...");
    try {
      const { data: existing } = await supabase.from('promociones').select('id').eq('id_negocio', bizFormData.id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('promociones').update({
          mensaje: promoFormData.mensaje,
          radio_km: promoFormData.radio_km,
          frecuencia_horas: promoFormData.frecuencia_horas,
          activa: promoFormData.activa,
          imagen_url: promoFormData.imagen_url
        }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('promociones').insert([{
          id_negocio: bizFormData.id,
          mensaje: promoFormData.mensaje,
          radio_km: promoFormData.radio_km,
          frecuencia_horas: promoFormData.frecuencia_horas,
          activa: promoFormData.activa,
          imagen_url: promoFormData.imagen_url
        }]);
        if (error) throw error;
      }
      setSaveStatus("Promo Relámpago Activada ⚡");
      setShowPromoManager(false);
      await fetchAllData();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus("Error: " + err.message);
    } finally { setIsSyncing(false); }
  };

  const handleSaveProduct = async (e?: React.FormEvent, data?: Partial<Product>) => {
    if (e) e.preventDefault();
    const targetData = data || productFormData;
    if (!bizFormData.id || !targetData.nombre) return;
    
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('productos').insert([{
        id_negocio: bizFormData.id,
        nombre: targetData.nombre,
        precio: targetData.precio,
        descripcion: targetData.descripcion,
        categoria: targetData.categoria
      }]);
      if (error) throw error;
      if (!data) setProductFormData({ nombre: '', precio: 0, descripcion: '', categoria: 'General' });
      await fetchAllData();
    } catch (err) {
      console.error("Error saving product:", err);
    } finally { setIsSyncing(false); }
  };

  const handleIAScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bizFormData.id) return;

    setIsScanning(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type } },
              { text: "Analiza esta imagen o PDF de un menú y extrae todos los platillos. Devuelve un JSON con una lista de objetos que tengan: nombre_platillo, precio (solo el número), y descripcion." }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nombre_platillo: { type: Type.STRING },
                  precio: { type: Type.NUMBER },
                  descripcion: { type: Type.STRING }
                },
                required: ["nombre_platillo", "precio"]
              }
            }
          }
        });

        const results = JSON.parse(response.text || "[]");
        for (const item of results) {
          await handleSaveProduct(undefined, {
            nombre: item.nombre_platillo,
            precio: item.precio,
            descripcion: item.descripcion,
            categoria: "Escaneado con IA"
          });
        }
        alert(`¡IA Scanner finalizado! Se han importado ${results.length} platillos.`);
      };
    } catch (err) {
      console.error("Error IA Scan:", err);
      alert("Hubo un error al procesar el menú con IA.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Eliminar este platillo?")) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('productos').delete().eq('id', id);
      if (error) throw error;
      await fetchAllData();
    } catch (err) {
      console.error("Error delete product:", err);
    } finally { setIsSyncing(false); }
  };

  // RADAR LOGIC
  useEffect(() => {
    if (userRole === 'CLIENTE' && promotions.length > 0) {
      const verificarRadar = () => {
        try {
          const now = Date.now();
          const promoMemory = JSON.parse(localStorage.getItem('promo_radar_memory') || '{}');
          promotions.forEach(promo => {
            if (!promo.activa) return;
            const biz = businesses.find(b => b.id === promo.id_negocio);
            if (!biz) return;
            const lastSeen = promoMemory[promo.id] || 0;
            const frequencyLimit = (promo.frecuencia_horas || 4) * 3600000;
            if (now - lastSeen < frequencyLimit) return;
            const dist = calculateDistance(userLocation.lat, userLocation.lng, biz.coordenadas.lat, biz.coordenadas.lng);
            if (dist <= promo.radio_km) {
              if (audioRef.current) audioRef.current.play().catch(() => {});
              setActivePromoNotif({ promo, biz });
              promoMemory[promo.id] = now;
              localStorage.setItem('promo_radar_memory', JSON.stringify(promoMemory));
            }
          });
        } catch (e) { console.error(e); }
      };
      const timerId = setTimeout(() => {
        verificarRadar();
        const intervalId = setInterval(verificarRadar, 60000);
        return () => clearInterval(intervalId);
      }, 5000);
      return () => clearTimeout(timerId);
    }
  }, [userRole, promotions, businesses, userLocation]);

  // GPS Seguimiento
  useEffect(() => { 
    if (userRole) {
      fetchAllData();
      if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setIsGPSEnabled(true);
          },
          () => setUserLocation(DEFAULT_LOCATION),
          { enableHighAccuracy: true, timeout: 10000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
      }
    }
  }, [userRole]);

  // Lógica de Mapa
  useEffect(() => {
    if (activeTab === 'geofencing' && userRole) {
      const initMap = () => {
        try {
          if (mapRef.current) mapRef.current.remove();
          const map = L.map('map');
          mapRef.current = map;
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

          const bounds = L.latLngBounds([userLocation.lat, userLocation.lng]);

          L.marker([userLocation.lat, userLocation.lng], {
            icon: L.divIcon({
              className: 'user-marker',
              html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(59,130,246,0.8);"></div>`
            })
          }).addTo(map);

          businesses.forEach(b => {
            const open = isBusinessOpen(b.hora_apertura, b.hora_cierre);
            const promoActiva = promotions.find(p => p.id_negocio === b.id && p.activa);
            const markerLocation = [b.coordenadas.lat, b.coordenadas.lng];
            bounds.extend(markerLocation);

            const iconHtml = promoActiva ? 
              `<div class="flex items-center justify-center animate-bounce">
                <div style="background-color: #ef4444; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 20px #ef4444; display: flex; align-items: center; justify-center: center; color: white; font-size: 14px;">🔥</div>
              </div>` : 
              `<div style="background-color: #ea580c; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white;"></div>`;

            const marker = L.marker(markerLocation, {
              icon: L.divIcon({ className: 'custom-biz-marker', html: iconHtml, iconSize: [30, 30] })
            }).addTo(map);

            const popupContent = `
              <div class="p-3 font-sans min-w-[160px]">
                <h3 class="font-black uppercase text-orange-600 mb-0.5 leading-tight">${b.nombre}</h3>
                <span class="text-[9px] font-bold text-gray-400 uppercase block mb-2">${b.categoria}</span>
                <p class="text-[10px] font-black ${open ? 'text-green-500' : 'text-red-500'} mb-3">
                  ${open ? '● ABIERTO' : '● CERRADO'}
                </p>
                <div class="space-y-2">
                  <a href="https://www.google.com/maps/dir/?api=1&destination=${b.coordenadas.lat},${b.coordenadas.lng}" 
                     onclick="window.logMapsClick('${b.id}')"
                     target="_blank" class="flex items-center justify-center gap-1 w-full bg-orange-600 text-white text-[10px] font-black py-2.5 rounded-lg uppercase italic shadow-md transition-all hover:scale-105">📍 IR AHORA</a>
                  <button onclick="window.selectBusinessFromMap('${b.id}')" class="w-full bg-black text-white text-[10px] font-black py-2 rounded-lg uppercase italic shadow transition-all hover:bg-gray-800">Ver Detalles</button>
                </div>
              </div>
            `;
            marker.bindPopup(popupContent, { closeButton: false, offset: [0, -10] });
          });

          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } catch (e) { console.error(e); }
      };
      setTimeout(initMap, 200);
    }
  }, [activeTab, userLocation, businesses, promotions, userRole]);

  // Derived data
  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'geofencing', label: 'MAPA REAL', roles: ['CLIENTE', 'PATROCINADOR', 'ADMIN'] },
      { id: 'cupones', label: 'CUPONES Y ANTOJOS', roles: ['CLIENTE', 'ADMIN'] },
      { id: 'mi_dashboard', label: 'MI DASHBOARD', roles: ['PATROCINADOR'] },
      { id: 'admin_cupones', label: 'MÉTRICAS', roles: ['ADMIN'] },
      { id: 'registro', label: 'NUEVO PUNTO', roles: ['ADMIN'] },
    ];
    return baseTabs.filter(tab => tab.roles.includes(userRole || ''));
  }, [userRole]);

  const sortedBusinesses = useMemo(() => {
    return businesses
      .filter(b => b.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || b.categoria.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        const distA = calculateDistance(userLocation.lat, userLocation.lng, a.coordenadas.lat, a.coordenadas.lng);
        const distB = calculateDistance(userLocation.lat, userLocation.lng, b.coordenadas.lat, b.coordenadas.lng);
        return distA - distB;
      });
  }, [businesses, searchTerm, userLocation]);

  const selectedBusiness = useMemo(() => businesses.find(b => b.id === selectedBusinessId), [businesses, selectedBusinessId]);

  if (!userRole) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#111] p-10 rounded-[60px] border border-orange-600/30 text-center shadow-2xl animate-fadeIn">
          <span className="text-7xl block mb-6">🍔</span>
          <h1 className="text-3xl font-black text-orange-500 italic uppercase mb-2">Calle del Hambre</h1>
          <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase mb-10">Selecciona tu perfil</p>
          <div className="space-y-4">
            <button onClick={() => setUserRole('CLIENTE')} className="w-full bg-white text-black py-5 rounded-[25px] font-black uppercase italic hover:bg-orange-500 hover:text-white transition-all">Soy Comensal 😋</button>
            <button onClick={() => setUserRole('PATROCINADOR')} className="w-full bg-[#222] text-white py-5 rounded-[25px] font-black uppercase italic hover:border-orange-600 border border-transparent transition-all">Tengo un Negocio 🏪</button>
            <button onClick={() => setUserRole('ADMIN')} className="w-full py-3 text-orange-500/50 text-[10px] font-black uppercase tracking-widest">Admin Access</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative overflow-x-hidden">
      
      {/* --- NOTIFICACIÓN RADAR --- */}
      {activePromoNotif && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[350] w-[95%] max-w-md animate-pushIn">
           <div className="bg-white rounded-[35px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.4)] border-2 border-orange-500 overflow-hidden relative">
              <button onClick={() => setActivePromoNotif(null)} className="absolute top-4 right-4 bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center font-black text-gray-400 hover:bg-red-500 hover:text-white transition-all z-10">✕</button>
              <div className="flex p-6 gap-5">
                 <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-inner flex-shrink-0 bg-orange-100 flex items-center justify-center">
                    {activePromoNotif.promo.imagen_url ? <img src={activePromoNotif.promo.imagen_url} className="w-full h-full object-cover" /> : <span className="text-4xl">🔥</span>}
                 </div>
                 <div className="flex-1">
                    <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest block mb-1">¡Sabor Cerca de Ti! ⚡️</span>
                    <h4 className="text-xl font-black italic uppercase text-black leading-tight mb-1">{activePromoNotif.biz.nombre}</h4>
                    <p className="text-sm font-bold text-gray-500 leading-tight">{activePromoNotif.promo.mensaje}</p>
                 </div>
              </div>
              <div className="px-6 pb-6">
                 <button onClick={() => {
                   const biz = activePromoNotif.biz;
                   setActiveTab('geofencing');
                   setActivePromoNotif(null);
                   setTimeout(() => { if (mapRef.current) mapRef.current.setView([biz.coordenadas.lat, biz.coordenadas.lng], 18); }, 400);
                 }} className="w-full bg-orange-600 text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-black uppercase italic text-sm shadow-xl hover:bg-orange-700 transition-all">🚀 ¡Ir ahora!</button>
              </div>
           </div>
        </div>
      )}

      <header className="bg-black text-white p-6 flex items-center justify-between border-b-4 border-orange-600">
        <div className="flex items-center gap-4">
          <span className="text-3xl">🍔</span>
          <h1 className="text-2xl font-black uppercase italic text-orange-500">Calle del Hambre</h1>
        </div>
        <button onClick={() => {setUserRole(null); setSelectedBusinessId(null);}} className="text-[9px] font-black uppercase bg-white/10 px-3 py-2 rounded-full">Salir</button>
      </header>

      <nav className="bg-white border-b sticky top-0 z-[80] shadow-md overflow-x-auto whitespace-nowrap scrollbar-hide">
        <div className="flex p-2 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedBusinessId(null); setIsEditing(false); }}
              className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === tab.id ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 container mx-auto p-4 max-w-7xl">
        <div className="animate-fadeIn">
          {activeTab === 'geofencing' && (
            <div className="bg-white p-4 rounded-[40px] shadow-2xl border border-gray-100">
              <div id="map" className="overflow-hidden min-h-[500px]"></div>
            </div>
          )}

          {activeTab === 'mi_dashboard' && (
            <div className="bg-white p-10 rounded-[50px] shadow-2xl border-l-[15px] border-orange-600 space-y-10">
              <div className="flex justify-between items-center flex-wrap gap-4">
                 <h2 className="text-4xl font-black italic uppercase">Mi Dashboard</h2>
                 <div className="flex gap-3 flex-wrap">
                    <button onClick={() => setShowMenuManager(!showMenuManager)} className="bg-blue-600 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all">Gestión de Carta 📜</button>
                    <button onClick={() => setShowPromoManager(!showPromoManager)} className="bg-orange-600 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:scale-105 transition-all">Promo Relámpago ⚡</button>
                    {!isEditing && <button onClick={() => setIsEditing(true)} className="bg-black text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow hover:bg-gray-800 transition-all">Editar Local</button>}
                 </div>
              </div>

              {saveStatus && <div className="bg-orange-50 text-orange-600 p-4 rounded-2xl font-black uppercase text-center animate-pulse">{saveStatus}</div>}

              {/* GESTIÓN DE CARTA / MENÚ */}
              {showMenuManager && (
                <div className="bg-blue-50 p-8 rounded-[40px] border-2 border-blue-100 animate-fadeIn space-y-8">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black uppercase italic">Gestión de Carta / Menú Digital</h3>
                    <button onClick={() => setShowMenuManager(false)} className="text-gray-400 font-black">CERRAR ✕</button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* OPCIÓN A: IA SCANNER */}
                    <div className="bg-white p-6 rounded-[30px] border border-blue-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">✨</span>
                        <h4 className="font-black uppercase italic text-sm">IA Scanner (PDF/Imagen)</h4>
                      </div>
                      <p className="text-[11px] text-gray-500 font-bold leading-tight">Sube una foto de tu menú y Gemini extraerá automáticamente los platillos y precios.</p>
                      <label className={`w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-300 rounded-2xl cursor-pointer hover:bg-blue-50 transition-all ${isScanning ? 'opacity-50 pointer-events-none' : ''}`}>
                        <span className="text-xs font-black uppercase text-blue-600">{isScanning ? 'Procesando con IA...' : 'Seleccionar Archivo'}</span>
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleIAScan} />
                      </label>
                      {isScanning && <div className="h-1 bg-blue-200 w-full rounded-full overflow-hidden"><div className="h-full bg-blue-600 animate-progress"></div></div>}
                    </div>

                    {/* OPCIÓN B: CARGA MANUAL */}
                    <div className="bg-white p-6 rounded-[30px] border border-blue-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">📝</span>
                        <h4 className="font-black uppercase italic text-sm">Carga Manual</h4>
                      </div>
                      <form onSubmit={handleSaveProduct} className="space-y-3">
                        <input value={productFormData.nombre} onChange={e => setProductFormData({...productFormData, nombre: e.target.value})} className="form-input text-xs" placeholder="Nombre del platillo" required />
                        <div className="flex gap-2">
                          <input type="number" value={productFormData.precio} onChange={e => setProductFormData({...productFormData, precio: Number(e.target.value)})} className="form-input text-xs w-24" placeholder="Precio" required />
                          <input value={productFormData.categoria} onChange={e => setProductFormData({...productFormData, categoria: e.target.value})} className="form-input text-xs" placeholder="Categoría (Ej: Combos)" />
                        </div>
                        <input value={productFormData.descripcion} onChange={e => setProductFormData({...productFormData, descripcion: e.target.value})} className="form-input text-xs" placeholder="Breve descripción" />
                        <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-md">Agregar Platillo</button>
                      </form>
                    </div>
                  </div>

                  {/* LISTA DE PRODUCTOS */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black uppercase text-blue-600">Mi Carta Actual ({products.filter(p => p.id_negocio === bizFormData.id).length} items)</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {products.filter(p => p.id_negocio === bizFormData.id).map(p => (
                        <div key={p.id} className="bg-white p-4 rounded-2xl border border-blue-100 flex justify-between items-center group">
                          <div>
                            <h6 className="font-black uppercase text-[11px] leading-tight">{p.nombre}</h6>
                            <p className="text-[10px] font-bold text-gray-400">${p.precio} • {p.categoria}</p>
                          </div>
                          <button onClick={() => handleDeleteProduct(p.id!)} className="text-red-400 font-black text-xs hover:text-red-600 transition-all opacity-0 group-hover:opacity-100">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* PROMO RELÁMPAGO (RESTAURADO) */}
              {showPromoManager && (
                <div className="bg-orange-50 p-8 rounded-[40px] border-2 border-orange-100 animate-fadeIn">
                  <h3 className="text-xl font-black uppercase italic mb-6">Módulo Promo Relámpago</h3>
                  <form onSubmit={handleSavePromo} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="block col-span-2">
                      <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block">Mensaje de Alerta (Gancho)</span>
                      <input value={promoFormData.mensaje} onChange={e => setPromoFormData({...promoFormData, mensaje: e.target.value})} className="form-input" placeholder="Ej: ¡2x1 en hamburguesas hoy!" required />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block">Radio de Alcance (Km)</span>
                      <input type="number" step="0.5" value={promoFormData.radio_km} onChange={e => setPromoFormData({...promoFormData, radio_km: Number(e.target.value)})} className="form-input" required />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block">Frecuencia (Horas)</span>
                      <input type="number" value={promoFormData.frecuencia_horas} onChange={e => setPromoFormData({...promoFormData, frecuencia_horas: Number(e.target.value)})} className="form-input" required />
                    </label>
                    <label className="block col-span-2">
                      <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block">Imagen URL (Opcional)</span>
                      <input value={promoFormData.imagen_url} onChange={e => setPromoFormData({...promoFormData, imagen_url: e.target.value})} className="form-input" placeholder="https://..." />
                    </label>
                    <div className="col-span-2 flex items-center gap-4 bg-white p-4 rounded-2xl border border-orange-100">
                      <input type="checkbox" id="promo-active" checked={promoFormData.activa} onChange={e => setPromoFormData({...promoFormData, activa: e.target.checked})} className="w-6 h-6 accent-orange-600 cursor-pointer" />
                      <label htmlFor="promo-active" className="font-black uppercase italic text-sm cursor-pointer">Activar Promo en Radar</label>
                    </div>
                    <button type="submit" className="col-span-2 bg-orange-600 text-white py-4 rounded-2xl font-black uppercase italic text-lg shadow-xl hover:bg-orange-700 transition-all">Lanzar Promo Relámpago 🚀</button>
                    <button type="button" onClick={() => setShowPromoManager(false)} className="col-span-2 text-[10px] font-black uppercase text-gray-400">Cancelar</button>
                  </form>
                </div>
              )}

              {/* EDICIÓN DE LOCAL (RESTAURADO) */}
              {isEditing ? (
                <div className="bg-gray-50 p-8 rounded-[40px] border border-gray-200 animate-fadeIn">
                  <h3 className="text-xl font-black uppercase italic mb-6">Información del Negocio</h3>
                  <form onSubmit={handleSaveBusiness} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="block col-span-2">
                      <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">Nombre del Local</span>
                      <input value={bizFormData.nombre} onChange={e => setBizFormData({...bizFormData, nombre: e.target.value})} className="form-input" required />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">WhatsApp de Pedidos</span>
                      <input value={bizFormData.telefono} onChange={e => setBizFormData({...bizFormData, telefono: e.target.value})} className="form-input" placeholder="Ej: 584120000000" required />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">Imagen del Menú (Link)</span>
                      <input value={bizFormData.imagenMenu} onChange={e => setBizFormData({...bizFormData, imagenMenu: e.target.value})} className="form-input" placeholder="https://..." required />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">Apertura (HH:MM)</span>
                      <input type="time" value={bizFormData.hora_apertura} onChange={e => setBizFormData({...bizFormData, hora_apertura: e.target.value})} className="form-input" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">Cierre (HH:MM)</span>
                      <input type="time" value={bizFormData.hora_cierre} onChange={e => setBizFormData({...bizFormData, hora_cierre: e.target.value})} className="form-input" />
                    </label>
                    <div className="col-span-2 flex gap-4">
                      <button type="submit" className="flex-1 bg-black text-white py-4 rounded-2xl font-black uppercase italic text-lg shadow-xl hover:bg-gray-800 transition-all">Guardar Datos</button>
                      <button type="button" onClick={() => setIsEditing(false)} className="px-8 bg-white border-2 border-gray-200 rounded-2xl font-black text-gray-400">Volver</button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 bg-orange-50 rounded-[40px] text-center border border-orange-100 shadow-sm">
                     <h5 className="text-5xl font-black text-orange-600 mb-2">{metrics.views}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Visitas Perfil</p>
                  </div>
                  <div className="p-10 bg-green-50 rounded-[40px] text-center border border-green-100 shadow-sm">
                     <h5 className="text-5xl font-black text-green-600 mb-2">{metrics.whatsapp}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Consultas WA</p>
                  </div>
                  <div className="p-10 bg-blue-50 rounded-[40px] text-center border border-blue-100 shadow-sm">
                     <h5 className="text-5xl font-black text-blue-600 mb-2">{metrics.maps}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Rutas Trazadas</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cupones' && (
            <div className="space-y-8">
              {selectedBusinessId === null ? (
                <>
                  <div className="bg-black p-8 rounded-[40px] flex items-center justify-between gap-4 shadow-xl border-b-4 border-orange-600">
                    <h2 className="text-3xl font-black text-orange-500 italic uppercase">LA CALLE</h2>
                    <input placeholder="Buscar antojo o local..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-1/2 px-6 py-4 bg-white/10 text-white rounded-full text-sm font-bold outline-none border border-white/10 focus:border-orange-500 transition-all"/>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-10">
                    {sortedBusinesses.map(b => (
                      <div key={b.id} className="group bg-white rounded-[45px] shadow-xl border border-gray-100 overflow-hidden flex flex-col hover:-translate-y-2 transition-all duration-300">
                        <div className="h-44 bg-gray-200 cursor-pointer overflow-hidden" onClick={() => (window as any).selectBusinessFromMap(b.id)}>
                          <img src={b.imagenMenu || 'https://picsum.photos/400/600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        </div>
                        <div className="p-7 flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="text-xl font-black italic uppercase truncate text-black mb-1">{b.nombre}</h4>
                            <span className="text-[10px] font-black uppercase text-orange-500 bg-orange-50 px-3 py-1 rounded-full">{b.categoria}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-6">
                            <a href={`https://wa.me/${b.telefono}`} target="_blank" onClick={() => logMetric(b.id, 'whatsapp')} className="bg-[#25D366] text-white py-3 rounded-2xl text-center font-black text-[10px] uppercase italic shadow-md hover:bg-[#1fb355] transition-all">WhatsApp</a>
                            <button onClick={() => (window as any).selectBusinessFromMap(b.id)} className="bg-black text-white py-3 rounded-2xl font-black text-[10px] uppercase italic shadow-md hover:bg-gray-800 transition-all">Ver Promos</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="animate-fadeIn space-y-8">
                  <button onClick={() => setSelectedBusinessId(null)} className="font-black text-[11px] uppercase italic text-orange-600 bg-orange-50 px-6 py-3 rounded-full hover:bg-orange-100 transition-all">⬅ Volver al Listado</button>
                  <div className="bg-white rounded-[60px] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-gray-100">
                    <div className="md:w-1/2 h-80 md:h-auto overflow-hidden">
                       <img src={selectedBusiness?.imagenMenu || 'https://picsum.photos/800/600'} className="w-full h-full object-cover" />
                    </div>
                    <div className="md:w-1/2 p-12 space-y-8 flex flex-col justify-center">
                      <div>
                        <h2 className="text-4xl font-black italic uppercase leading-none mb-2">{selectedBusiness?.nombre}</h2>
                        <p className="text-sm font-bold text-gray-500">{selectedBusiness?.descripcion}</p>
                      </div>
                      
                      {/* CARTA DIGITAL EN DETALLES */}
                      <div className="space-y-4">
                        <h5 className="text-[11px] font-black uppercase text-blue-600 tracking-[0.3em]">CARTA DIGITAL</h5>
                        <div className="grid grid-cols-1 gap-3">
                          {products.filter(p => p.id_negocio === selectedBusinessId).length === 0 ? <p className="text-gray-300 italic text-xs">Aún no se ha cargado el menú digital.</p> : products.filter(p => p.id_negocio === selectedBusinessId).map(p => (
                            <div key={p.id} className="flex justify-between items-center border-b border-gray-100 pb-3">
                              <div className="flex-1">
                                <span className="text-sm font-black uppercase block">{p.nombre}</span>
                                <span className="text-[10px] font-bold text-gray-400">{p.descripcion}</span>
                              </div>
                              <span className="text-sm font-black text-orange-600 ml-4">${p.precio}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-gray-100">
                        <h5 className="text-[11px] font-black uppercase text-orange-600 tracking-[0.3em]">CUPONES Y OFERTAS</h5>
                        {coupons.filter(c => c.idNegocio === selectedBusinessId).length === 0 ? <p className="text-gray-300 italic">No hay cupones disponibles en este momento.</p> : coupons.filter(c => c.idNegocio === selectedBusinessId).map(c => (
                          <div key={c.id} className="bg-black text-white p-6 rounded-[35px] flex items-center justify-between shadow-xl border-l-8 border-orange-600 group">
                            <h4 className="text-lg font-black italic uppercase group-hover:text-orange-500 transition-all">{c.descripcionDescuento}</h4>
                            {!activeCoupon || activeCoupon.id !== c.id ? (
                              <button onClick={() => setActiveCoupon(c)} className="bg-orange-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase hover:scale-105 transition-all shadow-lg">Obtener QR</button>
                            ) : (
                              <div className="bg-white p-2 rounded-xl animate-scaleIn"><QRCodeSVG value={c.codigoQR} size={60} /></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'registro' && (
            <div className="max-w-2xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl border border-gray-100">
              <h2 className="text-3xl font-black italic uppercase mb-10 text-orange-600">Nuevo Aliado de la Calle</h2>
              <form onSubmit={handleSaveBusiness} className="space-y-6">
                 <label className="block">
                    <span className="text-[11px] font-black uppercase text-gray-400 mb-2 block">Nombre del Local</span>
                    <input value={bizFormData.nombre} onChange={e => setBizFormData({...bizFormData, nombre: e.target.value})} className="form-input" required />
                 </label>
                 <label className="block">
                    <span className="text-[11px] font-black uppercase text-gray-400 mb-2 block">Categoría Comercial</span>
                    <select value={bizFormData.categoria} onChange={e => setBizFormData({...bizFormData, categoria: e.target.value as BusinessCategory})} className="form-input">
                      <option value="Hamburguesas">Hamburguesas</option>
                      <option value="Perros Calientes">Perros Calientes</option>
                      <option value="Pizzas">Pizzas</option>
                      <option value="Arepas">Arepas</option>
                      <option value="Tacos">Tacos</option>
                      <option value="Postres">Postres</option>
                      <option value="Otros">Otros</option>
                    </select>
                 </label>
                 <label className="block">
                    <span className="text-[11px] font-black uppercase text-gray-400 mb-2 block">Breve Descripción</span>
                    <textarea value={bizFormData.descripcion} onChange={e => setBizFormData({...bizFormData, descripcion: e.target.value})} className="form-input h-24" required />
                 </label>
                 <button type="submit" className="w-full bg-black text-white py-5 rounded-[25px] font-black uppercase italic text-lg shadow-2xl hover:bg-orange-600 transition-all">Registrar en Plataforma 🍔</button>
                 {saveStatus && <p className="text-center font-black uppercase text-orange-600 italic">{saveStatus}</p>}
              </form>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-black text-white p-12 text-center border-t-[10px] border-orange-600 mt-10">
        <div className="text-[11px] font-black uppercase tracking-[0.5em] text-orange-500 italic">CALLE DEL HAMBRE - ADMIN v3.6 AI SCANNER</div>
        <p className="text-[9px] text-white/20 mt-4 uppercase font-bold">Ubicación Actual: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pushIn { from { opacity: 0; transform: translate(-50%, -30px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes scaleIn { from { scale: 0.5; opacity: 0; } to { scale: 1; opacity: 1; } }
        @keyframes progress { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .animate-pushIn { animation: pushIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out forwards; }
        .animate-progress { animation: progress 1.5s linear infinite; }
        .form-input { 
          background-color: #F8F8F8 !important; padding: 14px 20px !important; border: 2px solid transparent !important; width: 100%; border-radius: 18px; font-weight: 700; outline: none; transition: all 0.2s; font-size: 14px; color: black;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; box-shadow: 0 0 15px rgba(234, 88, 12, 0.1); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-biz-marker { background: none !important; border: none !important; }
        .leaflet-popup-content-wrapper { border-radius: 25px !important; padding: 5px !important; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.2) !important; }
        .leaflet-popup-tip { background: white !important; }
      `}} />
    </div>
  );
};

export default App;
