
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

const DEFAULT_LOCATION = { lat: 19.6468, lng: -99.2255 };

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
  const currentTime = Number(now.getHours()) * 60 + Number(now.getMinutes());
  const [hA, mA] = apertura.split(':').map(Number);
  const [hC, mC] = cierre.split(':').map(Number);
  const openTime = Number(hA) * 60 + Number(mA);
  const closeTime = Number(hC) * 60 + Number(mC);
  if (closeTime < openTime) return currentTime >= openTime || currentTime <= closeTime;
  return currentTime >= openTime && currentTime <= closeTime;
};

const App: React.FC = () => {
  // --- ESTADOS CORE ---
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState<string>('geofencing');
  
  // --- ESTADOS DE DATOS ---
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [metrics, setMetrics] = useState<{whatsapp: number, maps: number, views: number}>({ whatsapp: 0, maps: 0, views: 0 });
  const [userLocation, setUserLocation] = useState<GeoPoint>(DEFAULT_LOCATION);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  
  // --- E-COMMERCE & IA ---
  const [cart, setCart] = useState<{ [productId: string]: number }>({});
  const [detectedItems, setDetectedItems] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  // UI States
  const [isEditing, setIsEditing] = useState(false);
  const [showPromoManager, setShowPromoManager] = useState(false);
  const [showCouponLauncher, setShowCouponLauncher] = useState(false);
  const [showMenuManager, setShowMenuManager] = useState(false);
  const [activePromoNotif, setActivePromoNotif] = useState<{promo: Promotion, biz: Business} | null>(null);

  // Forms
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({});
  const [promoFormData, setPromoFormData] = useState<Partial<Promotion>>({ radio_km: 2, frecuencia_horas: 4, activa: true });
  const [couponFormData, setCouponFormData] = useState<Partial<Coupon>>({ descripcionDescuento: '', imagen_url: '' });
  const [productFormData, setProductFormData] = useState<Partial<Product>>({ nombre: '', precio: 0, descripcion: '', categoria: 'General' });
  
  const mapRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- LOGICA MÉTRICAS ---
  const logMetric = async (bizId: string, eventType: 'whatsapp' | 'maps' | 'view') => {
    try { await supabase.from('metricas').insert([{ id_negocio: bizId, tipo_evento: eventType }]); } catch (e) {}
  };

  useEffect(() => {
    (window as any).selectBusinessFromMap = (id: string) => {
      logMetric(id, 'view');
      setSelectedBusinessId(id);
      setActiveTab('cupones');
      setCart({});
    };
    (window as any).logMapsClick = (id: string) => logMetric(id, 'maps');
    // Sonido de parrilla (GRILL SOUND)
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
        id: b.id, nombre: b.nombre, descripcion: b.descripcion, coordenadas: { lat: b.lat, lng: b.lng }, 
        imagenMenu: b.imagen_menu || '', categoria: b.categoria as BusinessCategory,
        telefono: b.telefono, hora_apertura: b.hora_apertura, hora_cierre: b.hora_cierre, owner_id: b.owner_id
      }));
      setBusinesses(parsedBiz);
      setPromotions(pRes.data || []);
      setProducts(prRes.data || []);
      setCoupons((cRes.data || []).map(c => ({
        id: c.id, idNegocio: c.id_negocio, descripcionDescuento: c.descripcion_descuento, 
        codigoQR: c.codigo_qr, fechaExpiracion: c.fecha_expiracion, imagen_url: c.imagen_url
      })));
      if (userRole === 'PATROCINADOR' && parsedBiz.length > 0) {
        setBizFormData(parsedBiz[0]);
        const { data: mData } = await supabase.from('metricas').select('tipo_evento').eq('id_negocio', parsedBiz[0].id);
        if (mData) {
          const counts = mData.reduce((acc: any, curr: any) => {
            acc[curr.tipo_evento] = (acc[curr.tipo_evento] || 0) + 1; return acc;
          }, { whatsapp: 0, maps: 0, view: 0 });
          setMetrics({ whatsapp: counts.whatsapp, maps: counts.maps, views: counts.view });
        }
        const myPromo = (pRes.data || []).find(p => p.id_negocio === parsedBiz[0].id);
        if (myPromo) setPromoFormData(myPromo);
      }
    } catch (e) {} finally { setIsSyncing(false); }
  };

  // IA SCANNER
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
              { text: "Extrae platillos del menú. JSON lista de {nombre_platillo, precio, descripcion}." }
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
        setDetectedItems(JSON.parse(response.text || "[]"));
      };
    } catch (err) { alert("Error IA Scanner."); } finally { setIsScanning(false); }
  };

  const confirmDetectedItems = async () => {
    if (!bizFormData.id) return;
    setIsSyncing(true);
    try {
      for (const item of detectedItems) {
        await supabase.from('productos').insert([{
          id_negocio: bizFormData.id, nombre: item.nombre_platillo,
          precio: item.precio, descripcion: item.descripcion || '', categoria: "IA Scanner"
        }]);
      }
      setDetectedItems([]);
      await fetchAllData();
      alert("Menú actualizado!");
    } catch (e) {} finally { setIsSyncing(false); }
  };

  // HANDLERS
  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('negocios').update({
        nombre: bizFormData.nombre, descripcion: bizFormData.descripcion,
        imagen_menu: bizFormData.imagenMenu, telefono: bizFormData.telefono,
        hora_apertura: bizFormData.hora_apertura, hora_cierre: bizFormData.hora_cierre,
        categoria: bizFormData.categoria
      }).eq('id', bizFormData.id);
      if (error) throw error;
      setSaveStatus('Éxito!'); fetchAllData();
    } catch (err) { setSaveStatus('Error'); } finally { setIsSyncing(false); setTimeout(() => setSaveStatus(null), 3000); }
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizFormData.id) return;
    setIsSyncing(true);
    try {
      const { data: existing } = await supabase.from('promociones').select('id').eq('id_negocio', bizFormData.id).maybeSingle();
      if (existing) {
        await supabase.from('promociones').update({
          mensaje: promoFormData.mensaje, radio_km: promoFormData.radio_km,
          frecuencia_horas: promoFormData.frecuencia_horas, activa: true
        }).eq('id', existing.id);
      } else {
        await supabase.from('promociones').insert([{
          id_negocio: bizFormData.id, mensaje: promoFormData.mensaje,
          radio_km: promoFormData.radio_km, frecuencia_horas: promoFormData.frecuencia_horas, activa: true
        }]);
      }
      setSaveStatus('Promo Lanzada!'); fetchAllData(); setShowPromoManager(false);
    } catch (err) { setSaveStatus('Error Radar'); } finally { setIsSyncing(false); setTimeout(() => setSaveStatus(null), 3000); }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizFormData.id) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('cupones').insert([{
        id_negocio: bizFormData.id,
        descripcion_descuento: couponFormData.descripcionDescuento,
        codigo_qr: `CUP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        fecha_expiracion: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
        imagen_url: couponFormData.imagen_url
      }]);
      if (error) throw error;
      setSaveStatus('Cupón Lanzado!'); fetchAllData(); setShowCouponLauncher(false);
      setCouponFormData({ descripcionDescuento: '', imagen_url: '' });
    } catch (err) { setSaveStatus('Error Cupón'); } finally { setIsSyncing(false); setTimeout(() => setSaveStatus(null), 3000); }
  };

  // CARRITO
  const updateCart = (productId: string, delta: number) => {
    setCart(prev => {
      const q = (prev[productId] || 0) + delta;
      if (q <= 0) { const {[productId]: _, ...rest} = prev; return rest; }
      return { ...prev, [productId]: q };
    });
  };

  const cartTotal = useMemo(() => Object.entries(cart).reduce((a, [id, q]) => a + (products.find(p => p.id === id)?.precio || 0) * q, 0), [cart, products]);

  const handleCheckout = () => {
    const biz = businesses.find(b => b.id === selectedBusinessId);
    if (!biz) return;
    let msg = `¡Hola! Pedido de ${biz.nombre}:\n`;
    Object.entries(cart).forEach(([id, q]) => { const p = products.find(prod => prod.id === id); if (p) msg += `- ${q}x ${p.nombre} ($${p.precio * q})\n`; });
    msg += `\nTOTAL: $${cartTotal.toFixed(2)}\n¿Tiempo de entrega?`;
    window.open(`https://wa.me/${biz.telefono}?text=${encodeURIComponent(msg)}`, '_blank');
    logMetric(biz.id, 'whatsapp');
  };

  // RADAR (PERSISTENTE CON SONIDO)
  useEffect(() => {
    if (userRole === 'CLIENTE' && promotions.length > 0) {
      const radar = setInterval(() => {
        const memory = JSON.parse(localStorage.getItem('promo_radar_memory') || '{}');
        promotions.forEach(promo => {
          if (!promo.activa) return;
          const biz = businesses.find(b => b.id === promo.id_negocio);
          if (!biz) return;
          // Fix: Explicitly cast potentially non-numeric value from memory to Number to satisfy arithmetic requirements.
          if (Date.now() - (Number(memory[promo.id]) || 0) < (Number(promo.frecuencia_horas) || 4) * 3600000) return;
          if (calculateDistance(userLocation.lat, userLocation.lng, biz.coordenadas.lat, biz.coordenadas.lng) <= Number(promo.radio_km)) {
            if (audioRef.current) audioRef.current.play().catch(() => {});
            setActivePromoNotif({ promo, biz });
            // Fix: Store numeric value explicitly in memory.
            memory[promo.id] = Number(Date.now());
            localStorage.setItem('promo_radar_memory', JSON.stringify(memory));
          }
        });
      }, 20000);
      return () => clearInterval(radar);
    }
  }, [userRole, promotions, businesses, userLocation]);

  useEffect(() => {
    if (userRole) {
      fetchAllData();
      if (navigator.geolocation) navigator.geolocation.watchPosition(pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
    }
  }, [userRole]);

  useEffect(() => {
    if (activeTab === 'geofencing' && userRole) {
      setTimeout(() => {
        if (mapRef.current) mapRef.current.remove();
        const map = L.map('map').setView([userLocation.lat, userLocation.lng], 15);
        mapRef.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker([userLocation.lat, userLocation.lng], { icon: L.divIcon({ className: 'u-marker', html: `<div class="bg-blue-500 w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>` }) }).addTo(map);
        businesses.forEach(b => {
          const promo = promotions.find(p => p.id_negocio === b.id && p.activa);
          const icon = L.divIcon({ className: 'b-marker', html: promo ? `<div class="bg-red-600 p-2 rounded-full border-2 border-white shadow-xl animate-bounce text-xs">🔥</div>` : `<div class="bg-orange-600 w-3 h-3 rounded-full border-2 border-white"></div>` });
          L.marker([b.coordenadas.lat, b.coordenadas.lng], { icon }).addTo(map).bindPopup(`
            <div class="p-2 font-black text-[10px]">
              <h3 class="uppercase text-orange-600">${b.nombre}</h3>
              <p class="mb-2 text-gray-400 uppercase">${b.categoria}</p>
              <button onclick="window.selectBusinessFromMap('${b.id}')" class="w-full bg-orange-600 text-white py-2 rounded-lg uppercase italic shadow-lg">Ver Detalles / IR</button>
            </div>
          `, { closeButton: false });
        });
      }, 200);
    }
  }, [activeTab, businesses, promotions, userRole]);

  const tabs = useMemo(() => [
    { id: 'geofencing', label: 'MAPA REAL', roles: ['CLIENTE', 'PATROCINADOR', 'ADMIN'] },
    { id: 'cupones', label: 'ANTOJOS', roles: ['CLIENTE', 'ADMIN'] },
    { id: 'mi_dashboard', label: 'MI DASHBOARD', roles: ['PATROCINADOR'] },
    { id: 'registro', label: 'ADMIN PANEL', roles: ['ADMIN'] },
  ].filter(t => t.roles.includes(userRole || '')), [userRole]);

  const selectedBusiness = useMemo(() => businesses.find(b => b.id === selectedBusinessId), [businesses, selectedBusinessId]);

  if (!userRole) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#111] p-10 rounded-[50px] border border-orange-600/30 text-center shadow-2xl animate-fadeIn">
          <span className="text-7xl block mb-6">🍔</span>
          <h1 className="text-3xl font-black text-orange-500 italic uppercase mb-10">Calle del Hambre</h1>
          <div className="space-y-4">
            <button onClick={() => setUserRole('CLIENTE')} className="w-full bg-white text-black py-5 rounded-[25px] font-black uppercase italic hover:bg-orange-500 hover:text-white transition-all">Soy Comensal 😋</button>
            <button onClick={() => setUserRole('PATROCINADOR')} className="w-full bg-[#222] text-white py-5 rounded-[25px] font-black uppercase italic border border-white/10 hover:border-orange-500 transition-all">Soy Dueño 🏪</button>
            <button onClick={() => setUserRole('ADMIN')} className="w-full py-4 text-orange-500/30 text-[9px] font-black uppercase tracking-widest">Admin Access</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative pb-32">
      {/* NOTIFICACION RADAR (GRILL SOUND ACTIVE) */}
      {activePromoNotif && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[400] w-[90%] max-w-md animate-pushIn">
           <div className="bg-white rounded-[40px] shadow-2xl border-2 border-orange-500 p-6 flex gap-4 overflow-hidden">
              <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center text-4xl shadow-inner overflow-hidden flex-shrink-0">
                {activePromoNotif.promo.imagen_url ? <img src={activePromoNotif.promo.imagen_url} className="w-full h-full object-cover" /> : "🔥"}
              </div>
              <div className="flex-1">
                 <h4 className="font-black italic uppercase text-lg leading-tight">{activePromoNotif.biz.nombre}</h4>
                 <p className="text-xs font-bold text-gray-500 mb-4">{activePromoNotif.promo.mensaje}</p>
                 <button onClick={() => { (window as any).selectBusinessFromMap(activePromoNotif.biz.id); setActivePromoNotif(null); }} className="w-full bg-orange-600 text-white py-3 rounded-2xl font-black uppercase italic text-[10px] shadow-lg hover:bg-orange-700">🚀 ¡IR AHORA!</button>
              </div>
              <button onClick={() => setActivePromoNotif(null)} className="absolute top-4 right-4 text-gray-400 font-black">✕</button>
           </div>
        </div>
      )}

      <header className="bg-black text-white p-6 flex justify-between items-center border-b-4 border-orange-600 shadow-xl">
        <h1 className="text-xl font-black uppercase italic text-orange-500">Calle del Hambre</h1>
        <button onClick={() => {setUserRole(null); setSelectedBusinessId(null);}} className="text-[10px] font-black uppercase bg-white/10 px-4 py-2 rounded-full">Salir</button>
      </header>

      <nav className="bg-white border-b sticky top-0 z-[100] shadow-md flex p-2 gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {tabs.map(t => (
          <button key={t.id} onClick={() => {setActiveTab(t.id); setSelectedBusinessId(null);}} className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${activeTab === t.id ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-400'}`}>{t.label}</button>
        ))}
      </nav>

      <main className="flex-1 p-6">
        {activeTab === 'geofencing' && <div className="bg-white p-4 rounded-[50px] shadow-2xl border border-gray-100"><div id="map" className="min-h-[500px] rounded-[40px]"></div></div>}

        {activeTab === 'mi_dashboard' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
            <div className="bg-white p-10 rounded-[50px] shadow-2xl border-l-[15px] border-orange-600">
               <div className="flex justify-between items-center mb-10 flex-wrap gap-4">
                  <h2 className="text-3xl font-black italic uppercase">Mi Dashboard</h2>
                  <div className="flex gap-3 flex-wrap">
                    <button onClick={() => setShowCouponLauncher(!showCouponLauncher)} className="bg-purple-600 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:bg-purple-700 transition-all">Lanzar Cupón 🎟️</button>
                    <button onClick={() => setShowPromoManager(!showPromoManager)} className="bg-orange-600 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:scale-105 transition-all">Radar Promo ⚡</button>
                    <button onClick={() => setShowMenuManager(!showMenuManager)} className="bg-blue-600 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all">Menú IA 📜</button>
                  </div>
               </div>

               {saveStatus && <div className="bg-orange-50 text-orange-600 p-4 rounded-2xl font-black uppercase text-center mb-6 animate-pulse">{saveStatus}</div>}

               {/* LANZADOR DE CUPONES */}
               {showCouponLauncher && (
                 <div className="bg-purple-50 p-8 rounded-[40px] border-2 border-purple-100 mb-8 animate-fadeIn">
                    <h3 className="text-xl font-black uppercase italic text-purple-600 mb-6">Lanzar Nueva Campaña de Cupones</h3>
                    <form onSubmit={handleSaveCoupon} className="space-y-4">
                       <input value={couponFormData.descripcionDescuento} onChange={e => setCouponFormData({...couponFormData, descripcionDescuento: e.target.value})} className="form-input text-xs" placeholder="Título del Descuento (Ej: 20% OFF en Perros)" required />
                       <input value={couponFormData.imagen_url} onChange={e => setCouponFormData({...couponFormData, imagen_url: e.target.value})} className="form-input text-xs" placeholder="Imagen del Cupón (URL)" />
                       <button type="submit" className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black uppercase italic text-sm shadow-xl">Lanzar Campaña Ahora 🚀</button>
                    </form>
                 </div>
               )}

               {/* RADAR PROMO MANAGER */}
               {showPromoManager && (
                 <div className="bg-orange-50 p-8 rounded-[40px] border-2 border-orange-100 mb-8 animate-fadeIn">
                    <h3 className="text-xl font-black uppercase italic text-orange-600 mb-6">Configuración de Radar de 2KM</h3>
                    <form onSubmit={handleSavePromo} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <input value={promoFormData.mensaje} onChange={e => setPromoFormData({...promoFormData, mensaje: e.target.value})} className="form-input text-xs col-span-2" placeholder="Mensaje de Notificación Push" required />
                       <input type="number" step="0.5" value={promoFormData.radio_km} onChange={e => setPromoFormData({...promoFormData, radio_km: Number(e.target.value)})} className="form-input text-xs" placeholder="Radio de Alcance (KM)" required />
                       <input type="number" value={promoFormData.frecuencia_horas} onChange={e => setPromoFormData({...promoFormData, frecuencia_horas: Number(e.target.value)})} className="form-input text-xs" placeholder="Frecuencia (Horas)" required />
                       <button type="submit" className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black uppercase italic text-sm shadow-xl col-span-2">Activar Alerta de Proximidad ⚡</button>
                    </form>
                 </div>
               )}

               {/* MENÚ IA MANAGER */}
               {showMenuManager && (
                 <div className="bg-blue-50 p-8 rounded-[40px] border-2 border-blue-100 mb-8 animate-fadeIn space-y-6">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📷</span>
                      <h3 className="text-xl font-black uppercase italic text-blue-600">Scanner de Menú IA</h3>
                    </div>
                    <label className={`w-full flex flex-col items-center justify-center p-10 border-2 border-dashed border-blue-300 rounded-[35px] cursor-pointer hover:bg-white transition-all ${isScanning ? 'opacity-50 pointer-events-none' : ''}`}>
                       <span className="text-sm font-black uppercase text-blue-600">{isScanning ? 'Procesando Menú...' : 'Subir Foto de Menú'}</span>
                       <input type="file" className="hidden" onChange={handleIAScan} accept="image/*" />
                    </label>
                    {detectedItems.length > 0 && (
                      <div className="bg-white p-6 rounded-[30px] border border-blue-100 shadow-xl space-y-4">
                         <h5 className="font-black uppercase text-xs text-gray-400">Confirmar Platillos Detectados</h5>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {detectedItems.map((it, i) => (
                              <div key={i} className="bg-blue-50 p-3 rounded-xl flex justify-between items-center text-[11px] font-bold">
                                <span>{it.nombre_platillo}</span>
                                <span className="text-blue-600">${it.precio}</span>
                              </div>
                            ))}
                         </div>
                         <button onClick={confirmDetectedItems} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase italic text-xs shadow-xl">Guardar en Mi Carta 📜</button>
                      </div>
                    )}
                 </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 bg-orange-50 rounded-[40px] text-center border border-orange-100 shadow-sm hover:shadow-md transition-all">
                     <h5 className="text-5xl font-black text-orange-600 mb-2">{metrics.views}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Vistas Perfil</p>
                  </div>
                  <div className="p-10 bg-green-50 rounded-[40px] text-center border border-green-100 shadow-sm hover:shadow-md transition-all">
                     <h5 className="text-5xl font-black text-green-600 mb-2">{metrics.whatsapp}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Consultas WA</p>
                  </div>
                  <div className="p-10 bg-blue-50 rounded-[40px] text-center border border-blue-100 shadow-sm hover:shadow-md transition-all">
                     <h5 className="text-5xl font-black text-blue-600 mb-2">{metrics.maps}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Rutas Trazadas</p>
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'cupones' && (
          <div className="space-y-8 animate-fadeIn">
            {selectedBusinessId === null ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {businesses.filter(b => b.nombre.toLowerCase().includes(searchTerm.toLowerCase())).map(b => (
                  <div key={b.id} onClick={() => (window as any).selectBusinessFromMap(b.id)} className="bg-white rounded-[45px] shadow-xl overflow-hidden cursor-pointer hover:-translate-y-2 transition-all border border-gray-100 group">
                    <div className="h-44 bg-gray-200 overflow-hidden"><img src={b.imagenMenu || 'https://picsum.photos/400/300'} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" /></div>
                    <div className="p-7">
                      <h4 className="text-xl font-black italic uppercase mb-1">{b.nombre}</h4>
                      <span className="text-[10px] font-black uppercase text-orange-600 bg-orange-50 px-3 py-1 rounded-full">{b.categoria}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-8">
                <button onClick={() => setSelectedBusinessId(null)} className="bg-orange-50 text-orange-600 px-6 py-3 rounded-full font-black text-[10px] uppercase italic hover:bg-orange-100 transition-all">⬅ Volver al Listado</button>
                <div className="bg-white rounded-[60px] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-gray-100">
                   <div className="md:w-1/3 h-64 md:h-auto overflow-hidden"><img src={selectedBusiness?.imagenMenu} className="w-full h-full object-cover" /></div>
                   <div className="md:w-2/3 p-12 space-y-10">
                      <div>
                        <h2 className="text-4xl font-black italic uppercase mb-2">{selectedBusiness?.nombre}</h2>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">{selectedBusiness?.categoria}</p>
                      </div>

                      <div className="space-y-6">
                         <h5 className="text-[11px] font-black uppercase text-blue-600 tracking-[0.4em]">MENÚ DIGITAL INTERACTIVO</h5>
                         <div className="grid grid-cols-1 gap-4">
                            {products.filter(p => p.id_negocio === selectedBusinessId).map(p => (
                              <div key={p.id} className="bg-gray-50 p-6 rounded-[30px] border border-gray-100 flex justify-between items-center group hover:bg-white hover:shadow-lg transition-all">
                                 <div className="flex-1">
                                    <h6 className="font-black uppercase text-sm leading-none mb-1">{p.nombre}</h6>
                                    <p className="text-[10px] font-bold text-gray-400 mb-2">{p.descripcion}</p>
                                    <span className="font-black text-orange-600 italic">$ {p.precio}</span>
                                 </div>
                                 <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm">
                                    <button onClick={() => updateCart(p.id!, -1)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center font-black text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all">－</button>
                                    <span className="font-black text-sm w-4 text-center">{cart[p.id!] || 0}</span>
                                    <button onClick={() => updateCart(p.id!, 1)} className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center font-black text-orange-600 hover:bg-orange-600 hover:text-white transition-all">＋</button>
                                 </div>
                              </div>
                            ))}
                         </div>
                      </div>

                      <div className="pt-8 border-t border-gray-100">
                        <h5 className="text-[11px] font-black uppercase text-orange-600 tracking-[0.4em] mb-6 italic">CUPONES DISPONIBLES</h5>
                        <div className="grid grid-cols-1 gap-4">
                          {coupons.filter(c => c.idNegocio === selectedBusinessId).map(c => (
                             <div key={c.id} className="bg-black text-white p-6 rounded-[35px] flex justify-between items-center shadow-2xl border-l-8 border-orange-600 relative overflow-hidden group">
                                <div className="z-10 flex gap-4 items-center">
                                   {c.imagen_url && <img src={c.imagen_url} className="w-16 h-16 rounded-xl object-cover shadow-lg border border-white/20" />}
                                   <h4 className="font-black uppercase italic text-lg leading-tight">{c.descripcionDescuento}</h4>
                                </div>
                                {!activeCoupon || activeCoupon.id !== c.id ? (
                                  <button onClick={() => setActiveCoupon(c)} className="z-10 bg-orange-600 px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-lg hover:bg-orange-700 transition-all">OBTENER TICKET 🎫</button>
                                ) : (
                                  <div className="z-10 bg-white p-2 rounded-xl animate-scaleIn"><QRCodeSVG value={c.codigoQR} size={60} /></div>
                                )}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 rounded-full -translate-x-10 -translate-y-10 group-hover:scale-150 transition-all"></div>
                             </div>
                          ))}
                        </div>
                      </div>
                   </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* CARRITO FLOTANTE */}
      {cartTotal > 0 && selectedBusinessId && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-md animate-scaleIn">
           <button onClick={handleCheckout} className="w-full bg-black text-white p-8 rounded-[40px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] flex justify-between items-center border-b-8 border-orange-600 group active:scale-95 transition-all">
              <div className="flex items-center gap-4">
                 <div className="bg-orange-600 w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg group-hover:rotate-12 transition-all">🛒</div>
                 <div className="text-left">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Tu Pedido</p>
                    <h5 className="text-xl font-black italic uppercase">Total: ${cartTotal.toFixed(2)}</h5>
                 </div>
              </div>
              <span className="text-xs font-black uppercase italic bg-orange-600 px-6 py-3 rounded-full shadow-lg">WhatsApp 🚀</span>
           </button>
        </div>
      )}

      <footer className="bg-black text-white p-12 text-center border-t-[10px] border-orange-600 mt-10">
        <div className="text-[11px] font-black uppercase tracking-[0.5em] text-orange-500 italic mb-2">CALLE DEL HAMBRE - v4.5 RADAR ACTIVE</div>
        <p className="text-[8px] text-white/30 uppercase font-bold tracking-[0.3em]">Geofencing Radius: 2.0km | Scanner: Gemini Vision</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pushIn { from { opacity: 0; transform: translate(-50%, -30px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .animate-pushIn { animation: pushIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .animate-scaleIn { animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .form-input { 
          background-color: #F8F8F8 !important; padding: 14px 20px !important; border: 2px solid transparent !important; width: 100%; border-radius: 18px; font-weight: 700; outline: none; transition: all 0.2s; color: black;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .u-marker { background: none !important; border: none !important; }
        .b-marker { background: none !important; border: none !important; }
      `}} />
    </div>
  );
};

export default App;
