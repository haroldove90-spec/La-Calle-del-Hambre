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
  const [showMenuAIScanner, setShowMenuAIScanner] = useState(false);
  const [showMenuProductManager, setShowMenuProductManager] = useState(false);
  const [activePromoNotif, setActivePromoNotif] = useState<{promo: Promotion, biz: Business} | null>(null);
  
  // Admin UI State
  const [adminSelectedBizId, setAdminSelectedBizId] = useState<string | null>(null);

  // Forms
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({
    nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: DEFAULT_LOCATION, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00'
  });
  const [promoFormData, setPromoFormData] = useState<Partial<Promotion>>({ radio_km: 2, frecuencia_horas: 4, activa: true, mensaje: '' });
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
        id: b.id, nombre: b.nombre, descripcion: b.descripcion, coordenadas: { lat: parseFloat(b.lat), lng: parseFloat(b.lng) }, 
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

      // Cargar datos específicos si es Patrocinador
      if (userRole === 'PATROCINADOR' && parsedBiz.length > 0) {
        // En un escenario real buscaríamos por owner_id, aquí tomamos el primero disponible para el demo
        const myBiz = parsedBiz[0];
        setBizFormData(myBiz);
        const { data: mData } = await supabase.from('metricas').select('tipo_evento').eq('id_negocio', myBiz.id);
        if (mData) {
          const counts = mData.reduce((acc: any, curr: any) => {
            acc[curr.tipo_evento] = (acc[curr.tipo_evento] || 0) + 1; return acc;
          }, { whatsapp: 0, maps: 0, view: 0 });
          setMetrics({ whatsapp: counts.whatsapp, maps: counts.maps, views: counts.view });
        }
        const myPromo = (pRes.data || []).find(p => p.id_negocio === myBiz.id);
        if (myPromo) setPromoFormData(myPromo);
      }
    } catch (e) {} finally { setIsSyncing(false); }
  };

  // IA SCANNER (Soporte PDF e Imagenes)
  const handleIAScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Usamos adminSelectedBizId si está presente (modo Admin), si no, usamos bizFormData.id (modo Patrocinador)
    const targetBizId = adminSelectedBizId || bizFormData.id;

    if (!file || !targetBizId) {
      alert("Error: No hay un negocio seleccionado.");
      return;
    }

    setIsScanning(true);
    setSaveStatus("Analizando Menú con IA...");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Gemini flash soporta PDF e Imagenes
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type } },
              { text: "Eres un asistente experto en menús de restaurantes. Extrae TODOS los platillos del menú que ves en el archivo (imagen o PDF). Retorna una lista JSON limpia con {nombre_platillo, precio (solo el numero), descripcion (corta)}. Si hay secciones, ignóralas y danos la lista plana." }
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
        setSaveStatus("¡Análisis Completado! Revisa y guarda.");
      };
    } catch (err) { 
      console.error(err);
      alert("Error en el Scanner IA. Intenta con una imagen más clara o un PDF más ligero."); 
      setSaveStatus("Error en escaneo.");
    } finally { setIsScanning(false); }
  };
  
  const handleMenuUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    setSaveStatus("Subiendo archivo...");

    try {
      const filePath = `public/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('menus')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('menus')
        .getPublicUrl(filePath);

      if (!data.publicUrl) throw new Error("No se pudo obtener la URL pública.");

      setBizFormData(prev => ({ ...prev, imagenMenu: data.publicUrl }));
      setSaveStatus("Archivo subido. ¡Guarda los cambios!");
    } catch (error) {
      setSaveStatus("Error al subir archivo.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        if (saveStatus !== "Archivo subido. ¡Guarda los cambios!") {
          setSaveStatus(null);
        }
      }, 5000);
    }
  };


  const confirmDetectedItems = async () => {
    const targetBizId = adminSelectedBizId || bizFormData.id;
    if (!targetBizId) return;

    setIsSyncing(true);
    try {
      for (const item of detectedItems) {
        await supabase.from('productos').insert([{
          id_negocio: targetBizId, 
          nombre: item.nombre_platillo,
          precio: item.precio, 
          descripcion: item.descripcion || '', 
          categoria: "IA Import"
        }]);
      }
      setDetectedItems([]);
      await fetchAllData();
      alert("¡Menú Interactivo actualizado exitosamente!");
      setShowMenuAIScanner(false); // Cerrar scanner tras éxito
    } catch (e) {
      alert("Error guardando productos.");
    } finally { setIsSyncing(false); }
  };

  // HANDLERS
  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    setSaveStatus("Guardando...");
    try {
      if (bizFormData.id) {
        // ACTUALIZAR
        const { error } = await supabase.from('negocios').update({
          nombre: bizFormData.nombre, descripcion: bizFormData.descripcion,
          imagen_menu: bizFormData.imagenMenu, telefono: bizFormData.telefono,
          hora_apertura: bizFormData.hora_apertura, hora_cierre: bizFormData.hora_cierre,
          categoria: bizFormData.categoria,
          lat: bizFormData.coordenadas?.lat,
          lng: bizFormData.coordenadas?.lng
        }).eq('id', bizFormData.id);
        if (error) throw error;
      } else {
        // CREAR NUEVO (Solo Admin)
        const { error } = await supabase.from('negocios').insert([{
          nombre: bizFormData.nombre, descripcion: bizFormData.descripcion,
          lat: bizFormData.coordenadas?.lat || DEFAULT_LOCATION.lat, 
          lng: bizFormData.coordenadas?.lng || DEFAULT_LOCATION.lng,
          imagen_menu: bizFormData.imagenMenu || 'https://picsum.photos/400/600',
          categoria: bizFormData.categoria || 'Hamburguesas',
          telefono: bizFormData.telefono || '584120000000',
          hora_apertura: bizFormData.hora_apertura || '10:00',
          hora_cierre: bizFormData.hora_cierre || '22:00'
        }]);
        if (error) throw error;
        setBizFormData({ nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: DEFAULT_LOCATION, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00' });
      }
      setSaveStatus('¡Éxito!'); fetchAllData();
    } catch (err) { setSaveStatus('Error al guardar'); } finally { setIsSyncing(false); setTimeout(() => setSaveStatus(null), 3000); }
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
      setSaveStatus('¡Radar de Promo Lanzado! ⚡'); fetchAllData(); setShowPromoManager(false);
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
      setSaveStatus('¡Campaña de Cupón Lanzada! 🎟️'); fetchAllData(); setShowCouponLauncher(false);
      setCouponFormData({ descripcionDescuento: '', imagen_url: '' });
    } catch (err) { setSaveStatus('Error Cupón'); } finally { setIsSyncing(false); setTimeout(() => setSaveStatus(null), 3000); }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBizId = adminSelectedBizId || bizFormData.id;
    if (!targetBizId || !productFormData.nombre || productFormData.precio <= 0) {
      setSaveStatus('Nombre y precio son requeridos.');
      setTimeout(() => setSaveStatus(null), 3000);
      return;
    }
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('productos').insert([{
        id_negocio: targetBizId,
        nombre: productFormData.nombre,
        precio: productFormData.precio,
        descripcion: productFormData.descripcion || '',
        categoria: productFormData.categoria || 'General'
      }]);
      if (error) throw error;
      setSaveStatus('¡Producto añadido!');
      await fetchAllData();
      setProductFormData({ nombre: '', precio: 0, descripcion: '', categoria: 'General' });
    } catch (err) {
      setSaveStatus('Error al añadir producto.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('¿Seguro que quieres eliminar este producto?')) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('productos').delete().eq('id', productId);
      if (error) throw error;
      setSaveStatus('Producto eliminado.');
      await fetchAllData();
    } catch (err) {
      setSaveStatus('Error al eliminar.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // CARRITO
  const updateCart = (productId: string, delta: number) => {
    setCart(prev => {
      const q = (prev[productId] || 0) + delta;
      if (q <= 0) { const {[productId]: _, ...rest} = prev; return rest; }
      return { ...prev, [productId]: q };
    });
  };

  const cartTotal = useMemo(() => Object.entries(cart).reduce((a, [id, q]) => a + (Number(products.find(p => p.id === id)?.precio) || 0) * q, 0), [cart, products]);

  const handleCheckout = () => {
    const biz = businesses.find(b => b.id === selectedBusinessId);
    if (!biz) return;
    let msg = `¡Hola! Pedido de ${biz.nombre}:\n`;
    Object.entries(cart).forEach(([id, q]) => { const p = products.find(prod => prod.id === id); if (p) msg += `- ${q}x ${p.nombre} ($${Number(p.precio) * q})\n`; });
    msg += `\nTOTAL: $${cartTotal.toFixed(2)}\n(Pago contra entrega)\n¿Tiempo de entrega estimado?`;
    window.open(`https://wa.me/${biz.telefono}?text=${encodeURIComponent(msg)}`, '_blank');
    logMetric(biz.id, 'whatsapp');
  };

  // RADAR (PERSISTENTE CON SONIDO)
  useEffect(() => {
    if (userRole === 'CLIENTE' && promotions.length > 0) {
      const radar = setInterval(() => {
        const memory: Record<string, number> = JSON.parse(localStorage.getItem('promo_radar_memory') || '{}');
        promotions.forEach(promo => {
          if (!promo.activa) return;
          const biz = businesses.find(b => b.id === promo.id_negocio);
          if (!biz) return;
          
          const lastAlertTime = Number(memory[promo.id] || 0);
          const frequencyMs = Number(promo.frecuencia_horas || 4) * 3600000;

          if ((Date.now() - lastAlertTime) < frequencyMs) return;
          
          if (calculateDistance(userLocation.lat, userLocation.lng, biz.coordenadas.lat, biz.coordenadas.lng) <= Number(promo.radio_km || 2)) {
            if (audioRef.current) audioRef.current.play().catch(() => {});
            setActivePromoNotif({ promo, biz });
            memory[promo.id] = Date.now();
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
      if (navigator.geolocation) {
        navigator.geolocation.watchPosition(pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
      }
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
  }, [activeTab, businesses, promotions, userRole, userLocation]);

  const tabs = useMemo(() => [
    { id: 'geofencing', label: 'MAPA REAL', roles: ['CLIENTE', 'PATROCINADOR', 'ADMIN'] },
    { id: 'cupones', label: 'ANTOJOS', roles: ['CLIENTE', 'ADMIN'] },
    { id: 'mi_dashboard', label: 'MI DASHBOARD', roles: ['PATROCINADOR'] },
    { id: 'registro', label: 'ADMIN PANEL', roles: ['ADMIN'] },
  ].filter(t => t.roles.includes(userRole || '')), [userRole]);

  const selectedBusiness = useMemo(() => businesses.find(b => b.id === selectedBusinessId), [businesses, selectedBusinessId]);

  // COMPONENTE HELPER: TOOLS MANAGER (Reutilizable para Admin y Dashboard)
  const ToolsManager = ({ bizId }: { bizId: string }) => {
    return (
      <div className="space-y-8 animate-fadeIn mt-8 border-t pt-8 border-gray-200">
         <h3 className="text-xl font-black uppercase italic text-gray-800 mb-4">Gestión de Menú e Inventario</h3>
         
         {/* 1. IA SCANNER SECTION */}
         <div className="bg-blue-50 p-8 rounded-[35px] border border-blue-100">
             <div className="flex items-center gap-3 mb-4">
                 <span className="text-2xl">🤖</span>
                 <h4 className="font-black uppercase text-blue-700 text-sm">Convertir PDF/Imagen a Menú Interactivo</h4>
             </div>
             <p className="text-[10px] text-gray-500 mb-4 italic">Sube tu menú en PDF o Foto. La IA extraerá los productos y los agregará al catálogo digital automáticamente.</p>
             <label className={`w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-blue-300 rounded-[25px] cursor-pointer hover:bg-white transition-all ${isScanning ? 'opacity-50 pointer-events-none' : ''}`}>
                 <span className="text-xs font-black uppercase text-blue-600">{isScanning ? 'Procesando Documento...' : 'Subir PDF o Imagen 📂'}</span>
                 <input type="file" className="hidden" onChange={handleIAScan} accept="image/*,application/pdf" />
             </label>
             {detectedItems.length > 0 && (
                <div className="mt-6 bg-white p-6 rounded-[25px] border border-blue-100 shadow-xl">
                    <h5 className="font-black uppercase text-[10px] text-gray-400 mb-4">Platillos Detectados ({detectedItems.length})</h5>
                    <div className="max-h-40 overflow-y-auto space-y-2 mb-4 pr-2 scrollbar-hide">
                        {detectedItems.map((it, i) => (
                            <div key={i} className="flex justify-between text-[10px] border-b pb-1">
                                <span>{it.nombre_platillo}</span>
                                <span className="font-bold">${it.precio}</span>
                            </div>
                        ))}
                    </div>
                    <button onClick={confirmDetectedItems} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-blue-700">Confirmar y Guardar Productos ✅</button>
                </div>
             )}
         </div>

         {/* 2. MANUAL ADD SECTION */}
         <div className="bg-green-50 p-8 rounded-[35px] border border-green-100">
             <div className="flex items-center gap-3 mb-4">
                 <span className="text-2xl">✍️</span>
                 <h4 className="font-black uppercase text-green-700 text-sm">Alta Manual de Productos</h4>
             </div>
             
             {/* Listado Rápido */}
             <div className="mb-6 bg-white p-4 rounded-2xl max-h-40 overflow-y-auto scrollbar-hide border border-green-100">
                 {products.filter(p => p.id_negocio === bizId).length === 0 ? (
                     <p className="text-center text-[10px] text-gray-400 italic">No hay productos registrados.</p>
                 ) : (
                     products.filter(p => p.id_negocio === bizId).map(p => (
                         <div key={p.id} className="flex justify-between items-center py-2 border-b border-gray-50 text-[10px]">
                             <span className="font-bold text-gray-700">{p.nombre}</span>
                             <div className="flex gap-2 items-center">
                                 <span className="text-green-600 font-black">${p.precio}</span>
                                 <button onClick={() => handleDeleteProduct(p.id!)} className="text-red-500 font-black px-2 hover:bg-red-50 rounded">×</button>
                             </div>
                         </div>
                     ))
                 )}
             </div>

             <form onSubmit={handleSaveProduct} className="grid grid-cols-2 gap-3">
                 <input value={productFormData.nombre} onChange={e => setProductFormData({...productFormData, nombre: e.target.value})} className="form-input text-xs" placeholder="Nombre" required />
                 <input type="number" step="0.01" value={productFormData.precio} onChange={e => setProductFormData({...productFormData, precio: Number(e.target.value)})} className="form-input text-xs" placeholder="Precio $" required />
                 <textarea value={productFormData.descripcion} onChange={e => setProductFormData({...productFormData, descripcion: e.target.value})} className="form-input text-xs col-span-2 h-16" placeholder="Descripción..." />
                 <button type="submit" className="col-span-2 bg-green-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-green-700">Agregar Producto ＋</button>
             </form>
         </div>
      </div>
    );
  };

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
           <div className="bg-white rounded-[40px] shadow-2xl border-4 border-orange-500 p-8 flex gap-6 overflow-hidden relative">
              <div className="w-24 h-24 bg-orange-100 rounded-[30px] flex items-center justify-center text-5xl shadow-inner overflow-hidden flex-shrink-0 border-2 border-orange-200">
                {activePromoNotif.promo.imagen_url ? <img src={activePromoNotif.promo.imagen_url} className="w-full h-full object-cover" /> : "🔥"}
              </div>
              <div className="flex-1">
                 <h4 className="font-black italic uppercase text-2xl leading-tight text-black">{activePromoNotif.biz.nombre}</h4>
                 <p className="text-sm font-bold text-gray-500 mb-6 mt-2">{activePromoNotif.promo.mensaje}</p>
                 <button onClick={() => { (window as any).selectBusinessFromMap(activePromoNotif.biz.id); setActivePromoNotif(null); }} className="w-full bg-orange-600 text-white py-5 rounded-3xl font-black uppercase italic text-xs shadow-[0_15px_30px_-5px_rgba(234,88,12,0.5)] hover:bg-orange-700 hover:-translate-y-1 transition-all">🚀 ¡IR AHORA!</button>
              </div>
              <button onClick={() => setActivePromoNotif(null)} className="absolute top-4 right-6 text-gray-400 font-black text-xl hover:text-red-500 transition-colors">✕</button>
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
        {activeTab === 'geofencing' && <div className="bg-white p-4 rounded-[50px] shadow-2xl border border-gray-100"><div id="map" className="min-h-[550px] rounded-[40px]"></div></div>}

        {activeTab === 'mi_dashboard' && bizFormData.id && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
            <div className="bg-white p-10 rounded-[50px] shadow-2xl border-l-[15px] border-orange-600">
               <div className="flex justify-between items-center mb-10 flex-wrap gap-4">
                  <h2 className="text-3xl font-black italic uppercase">Mi Dashboard</h2>
                  <div className="flex gap-3 flex-wrap">
                    <button onClick={() => setShowCouponLauncher(!showCouponLauncher)} className="bg-purple-600 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:bg-purple-700 transition-all">Lanzar Cupón 🎟️</button>
                    <button onClick={() => setShowPromoManager(!showPromoManager)} className="bg-orange-600 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-lg hover:scale-105 transition-all">Radar Promo ⚡</button>
                  </div>
               </div>

               {saveStatus && <div className="bg-orange-50 text-orange-600 p-4 rounded-2xl font-black uppercase text-center mb-6 animate-pulse">{saveStatus}</div>}

               {/* HERRAMIENTAS DE GESTIÓN (IA Y MANUAL) INTEGRADAS */}
               <ToolsManager bizId={bizFormData.id} />

               {/* LANZADOR DE CUPONES */}
               {showCouponLauncher && (
                 <div className="mt-8 bg-purple-50 p-10 rounded-[45px] border-2 border-purple-100 mb-8 animate-fadeIn">
                    <h3 className="text-xl font-black uppercase italic text-purple-600 mb-8">Lanzar Nueva Campaña de Cupones</h3>
                    <form onSubmit={handleSaveCoupon} className="space-y-6">
                       <label className="block">
                          <span className="text-[10px] font-black uppercase text-purple-600 mb-2 block tracking-widest">Descripción del Descuento</span>
                          <input value={couponFormData.descripcionDescuento} onChange={e => setCouponFormData({...couponFormData, descripcionDescuento: e.target.value})} className="form-input text-xs" placeholder="Ej: 20% OFF en Combos Familiares" required />
                       </label>
                       <label className="block">
                          <span className="text-[10px] font-black uppercase text-purple-600 mb-2 block tracking-widest">Imagen de Campaña (URL)</span>
                          <input value={couponFormData.imagen_url} onChange={e => setCouponFormData({...couponFormData, imagen_url: e.target.value})} className="form-input text-xs" placeholder="https://mi-imagen.com/promo.jpg" />
                       </label>
                       <button type="submit" className="w-full bg-purple-600 text-white py-5 rounded-[25px] font-black uppercase italic text-sm shadow-[0_15px_30px_-5px_rgba(147,51,234,0.3)] hover:bg-purple-700">Lanzar Campaña Ahora 🚀</button>
                    </form>
                 </div>
               )}

               {/* RADAR PROMO MANAGER */}
               {showPromoManager && (
                 <div className="mt-8 bg-orange-50 p-10 rounded-[45px] border-2 border-orange-100 mb-8 animate-fadeIn">
                    <h3 className="text-xl font-black uppercase italic text-orange-600 mb-8">Configuración de Radar de Proximidad</h3>
                    <form onSubmit={handleSavePromo} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <label className="block col-span-2">
                          <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block tracking-widest">Mensaje de Notificación</span>
                          <input value={promoFormData.mensaje} onChange={e => setPromoFormData({...promoFormData, mensaje: e.target.value})} className="form-input text-xs" placeholder="Ej: ¡Estás cerca! Pasa por tu promo de hoy 🍔" required />
                       </label>
                       <label className="block">
                          <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block tracking-widest">Radio de Alcance (KM)</span>
                          <input type="number" step="0.5" value={promoFormData.radio_km} onChange={e => setPromoFormData({...promoFormData, radio_km: Number(e.target.value)})} className="form-input text-xs" placeholder="Ej: 2.0" required />
                       </label>
                       <label className="block">
                          <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block tracking-widest">Frecuencia de Alerta (Horas)</span>
                          <input type="number" value={promoFormData.frecuencia_horas} onChange={e => setPromoFormData({...promoFormData, frecuencia_horas: Number(e.target.value)})} className="form-input text-xs" placeholder="Ej: 4" required />
                       </label>
                       <button type="submit" className="w-full bg-orange-600 text-white py-5 rounded-[25px] font-black uppercase italic text-sm shadow-[0_15px_30px_-5px_rgba(234,88,12,0.3)] col-span-2 hover:bg-orange-700">Activar Alerta de Proximidad ⚡</button>
                    </form>
                 </div>
               )}
               
               {/* MÉTRICAS (VISIBLES SIEMPRE EN DASHBOARD) */}
               <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 bg-orange-50 rounded-[40px] text-center border border-orange-100 shadow-sm hover:shadow-lg transition-all group">
                     <h5 className="text-5xl font-black text-orange-600 mb-2 group-hover:scale-110 transition-transform">{metrics.views}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Visitas Perfil</p>
                  </div>
                  <div className="p-10 bg-green-50 rounded-[40px] text-center border border-green-100 shadow-sm hover:shadow-lg transition-all group">
                     <h5 className="text-5xl font-black text-green-600 mb-2 group-hover:scale-110 transition-transform">{metrics.whatsapp}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Consultas WA</p>
                  </div>
                  <div className="p-10 bg-blue-50 rounded-[40px] text-center border border-blue-100 shadow-sm hover:shadow-lg transition-all group">
                     <h5 className="text-5xl font-black text-blue-600 mb-2 group-hover:scale-110 transition-transform">{metrics.maps}</h5>
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Rutas Trazadas</p>
                  </div>
               </div>

               {/* EDITOR DE PERFIL (ACCESIBLE POR BOTÓN) */}
               <div className="mt-10 pt-10 border-t border-gray-100">
                  {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} className="w-full py-4 border-2 border-dashed border-gray-200 rounded-[25px] text-[10px] font-black uppercase text-gray-400 hover:border-orange-500 hover:text-orange-500 transition-all">Editar Información del Local ⚙️</button>
                  ) : (
                    <form onSubmit={handleSaveBusiness} className="space-y-6 animate-fadeIn">
                       <h4 className="font-black uppercase italic text-sm text-gray-400 mb-4">Perfil del Negocio</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <input value={bizFormData.nombre} onChange={e => setBizFormData({...bizFormData, nombre: e.target.value})} className="form-input text-xs" placeholder="Nombre Local" required />
                          <input value={bizFormData.telefono} onChange={e => setBizFormData({...bizFormData, telefono: e.target.value})} className="form-input text-xs" placeholder="WhatsApp (Ej: 58412...)" required />
                          <div className="col-span-2 space-y-4 bg-gray-50 p-4 rounded-2xl">
                             <label className="block">
                               <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">URL Imagen Principal / Menú</span>
                               <input value={bizFormData.imagenMenu} onChange={e => setBizFormData({...bizFormData, imagenMenu: e.target.value})} className="form-input text-xs" placeholder="Pega una URL o sube un archivo abajo" required />
                             </label>
                             <label className="block">
                               <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">...o Reemplazar Subiendo Archivo (PDF/Imagen)</span>
                               <input type="file" onChange={handleMenuUpload} accept="image/*,.pdf" className="form-input text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"/>
                             </label>
                          </div>
                          <textarea value={bizFormData.descripcion} onChange={e => setBizFormData({...bizFormData, descripcion: e.target.value})} className="form-input text-xs col-span-2 h-24" placeholder="Breve descripción del negocio" required />
                       </div>
                       <div className="flex gap-4">
                          <button type="submit" className="flex-1 bg-black text-white py-4 rounded-2xl font-black uppercase italic shadow-xl">Guardar Perfil</button>
                          <button type="button" onClick={() => setIsEditing(false)} className="px-8 border-2 border-gray-100 rounded-2xl font-black text-gray-400 uppercase text-[10px]">Cancelar</button>
                       </div>
                    </form>
                  )}
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
                        <h2 className="text-4xl font-black italic uppercase mb-2 leading-none">{selectedBusiness?.nombre}</h2>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em]">{selectedBusiness?.categoria}</p>
                        <p className="mt-6 text-gray-600 font-medium leading-relaxed">{selectedBusiness?.descripcion}</p>
                        {selectedBusiness?.imagenMenu && (
                          <a href={selectedBusiness.imagenMenu} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block bg-black text-white px-8 py-4 rounded-2xl font-black text-xs uppercase italic shadow-lg hover:bg-orange-600 transition-all">
                            Ver Menú Completo (PDF/Imagen) ↗
                          </a>
                        )}
                      </div>

                      <div className="space-y-6">
                         <h5 className="text-[11px] font-black uppercase text-blue-600 tracking-[0.4em] italic">MENÚ DIGITAL INTERACTIVO</h5>
                         <div className="grid grid-cols-1 gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                            {products.filter(p => p.id_negocio === selectedBusinessId).map(p => (
                              <div key={p.id} className="bg-gray-50/50 p-6 rounded-[35px] border border-gray-100 flex justify-between items-center group hover:bg-white hover:shadow-xl transition-all">
                                 <div className="flex-1">
                                    <h6 className="font-black uppercase text-base leading-none mb-1 text-black">{p.nombre}</h6>
                                    <p className="text-[10px] font-bold text-gray-400 mb-2">{p.descripcion}</p>
                                    <span className="font-black text-orange-600 italic text-sm">$ {p.precio}</span>
                                 </div>
                                 <div className="flex items-center gap-3 bg-white p-3 rounded-[20px] shadow-sm border border-gray-50">
                                    <button onClick={() => updateCart(p.id!, -1)} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center font-black text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all">－</button>
                                    <span className="font-black text-sm w-6 text-center">{cart[p.id!] || 0}</span>
                                    <button onClick={() => updateCart(p.id!, 1)} className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center font-black text-orange-600 hover:bg-orange-600 hover:text-white transition-all">＋</button>
                                 </div>
                              </div>
                            ))}
                            {products.filter(p => p.id_negocio === selectedBusinessId).length === 0 && (
                              <div className="p-10 text-center bg-gray-50 rounded-[35px] italic text-gray-400 text-xs">Este negocio aún no ha digitalizado su menú.</div>
                            )}
                         </div>
                      </div>

                      <div className="pt-8 border-t border-gray-100">
                        <h5 className="text-[11px] font-black uppercase text-orange-600 tracking-[0.4em] mb-6 italic">CUPONES Y PROMOCIONES</h5>
                        <div className="grid grid-cols-1 gap-4">
                          {coupons.filter(c => c.idNegocio === selectedBusinessId).map(c => (
                             <div key={c.id} className="bg-black text-white p-8 rounded-[40px] flex justify-between items-center shadow-2xl border-l-[10px] border-orange-600 relative overflow-hidden group">
                                <div className="z-10 flex gap-6 items-center">
                                   <div className="w-20 h-20 rounded-2xl bg-orange-600/20 flex items-center justify-center text-4xl shadow-inner border border-white/5">
                                      {c.imagen_url ? <img src={c.imagen_url} className="w-full h-full object-cover rounded-2xl" /> : "🎟️"}
                                   </div>
                                   <div>
                                      <h4 className="font-black uppercase italic text-xl leading-tight text-orange-500">{c.descripcionDescuento}</h4>
                                      <p className="text-[9px] font-bold text-white/40 mt-1 uppercase tracking-widest">Válido hasta agotar existencias</p>
                                   </div>
                                </div>
                                {!activeCoupon || activeCoupon.id !== c.id ? (
                                  <button onClick={() => setActiveCoupon(c)} className="z-10 bg-orange-600 px-8 py-5 rounded-[20px] text-[10px] font-black uppercase shadow-lg hover:bg-orange-700 hover:scale-105 transition-all">OBTENER 🎫</button>
                                ) : (
                                  <div className="z-10 bg-white p-3 rounded-2xl animate-scaleIn shadow-2xl"><QRCodeSVG value={c.codigoQR} size={80} /></div>
                                )}
                                <div className="absolute top-0 right-0 w-48 h-48 bg-orange-600/5 rounded-full -translate-x-10 -translate-y-10 group-hover:scale-125 transition-all"></div>
                             </div>
                          ))}
                          {coupons.filter(c => c.idNegocio === selectedBusinessId).length === 0 && (
                            <div className="p-8 text-center text-gray-300 italic text-xs uppercase tracking-widest">No hay cupones activos hoy.</div>
                          )}
                        </div>
                      </div>
                   </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'registro' && (
          <div className="max-w-2xl mx-auto animate-fadeIn space-y-12">
            {/* ADMIN SECTION 1: CREAR NUEVO */}
            <div className="bg-white p-12 rounded-[60px] shadow-2xl border border-gray-100 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-2 bg-orange-600"></div>
               <h2 className="text-3xl font-black italic uppercase mb-2 text-orange-600">Nuevo Aliado</h2>
               <p className="text-[10px] font-black uppercase text-gray-400 mb-10 tracking-[0.3em]">Registro Oficial de Negocio</p>
               
               <form onSubmit={handleSaveBusiness} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <label className="block col-span-2">
                        <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">Nombre Comercial</span>
                        <input value={bizFormData.nombre} onChange={e => setBizFormData({...bizFormData, nombre: e.target.value})} className="form-input" required placeholder="Ej: Hamburguesas El Chamo" />
                     </label>
                     <label className="block">
                        <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">Categoría</span>
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
                        <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">WhatsApp Delivery</span>
                        <input value={bizFormData.telefono} onChange={e => setBizFormData({...bizFormData, telefono: e.target.value})} className="form-input" placeholder="Ej: 584120000000" />
                     </label>
                     <label className="block">
                        <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">Latitud</span>
                        <input 
                            type="number"
                            step="any"
                            value={bizFormData.coordenadas?.lat ?? ''} 
                            onChange={e => setBizFormData(prev => ({ ...prev, coordenadas: { lng: prev.coordenadas?.lng ?? 0, lat: parseFloat(e.target.value) } }))} 
                            className="form-input" 
                            required 
                            placeholder="Ej: 19.6468" />
                    </label>
                    <label className="block">
                        <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">Longitud</span>
                        <input 
                            type="number"
                            step="any"
                            value={bizFormData.coordenadas?.lng ?? ''} 
                            onChange={e => setBizFormData(prev => ({ ...prev, coordenadas: { lat: prev.coordenadas?.lat ?? 0, lng: parseFloat(e.target.value) } }))}
                            className="form-input" 
                            required 
                            placeholder="Ej: -99.2255" />
                    </label>
                     <label className="block col-span-2">
                        <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">Descripción Gancho</span>
                        <textarea value={bizFormData.descripcion} onChange={e => setBizFormData({...bizFormData, descripcion: e.target.value})} className="form-input h-24" placeholder="¿Qué te hace especial en la calle?" required />
                     </label>
                     <div className="col-span-2 space-y-4 bg-gray-50 p-6 rounded-[30px] border">
                        <label className="block">
                           <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">URL de Imagen/Menú (PDF o JPG)</span>
                           <input value={bizFormData.imagenMenu || ''} onChange={e => setBizFormData({...bizFormData, imagenMenu: e.target.value})} className="form-input" placeholder="https://ejemplo.com/menu.jpg" />
                        </label>
                        <label className="block">
                           <span className="text-[10px] font-black uppercase text-gray-400 mb-2 block italic">...o Sube el Archivo Directamente</span>
                           <input type="file" onChange={handleMenuUpload} accept="image/*,.pdf" className="form-input file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"/>
                        </label>
                     </div>
                  </div>
                  <button type="submit" disabled={isSyncing} className="w-full bg-black text-white py-6 rounded-[30px] font-black uppercase italic text-lg shadow-2xl hover:bg-orange-600 transition-all disabled:opacity-50">
                    {isSyncing ? 'Sincronizando...' : 'Dar de Alta Negocio 🍔'}
                  </button>
                  {saveStatus && <p className="text-center font-black uppercase text-orange-600 italic animate-bounce">{saveStatus}</p>}
               </form>
            </div>
            
            {/* ADMIN SECTION 2: GESTIONAR EXISTENTES */}
            <div className="bg-white p-12 rounded-[60px] shadow-2xl border border-gray-100 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
               <h2 className="text-3xl font-black italic uppercase mb-2 text-blue-600">Gestión de Menús</h2>
               <p className="text-[10px] font-black uppercase text-gray-400 mb-10 tracking-[0.3em]">Administrar productos y Cartas IA</p>
               
               {!adminSelectedBizId ? (
                 <div className="space-y-4">
                   <p className="text-xs text-gray-400 italic mb-4">Selecciona un negocio para gestionar su menú:</p>
                   {businesses.map(b => (
                     <button key={b.id} onClick={() => setAdminSelectedBizId(b.id)} className="w-full flex justify-between items-center bg-gray-50 p-6 rounded-[25px] hover:bg-blue-50 transition-all group border border-transparent hover:border-blue-200">
                        <div className="text-left">
                           <h4 className="font-black uppercase text-gray-700 group-hover:text-blue-700">{b.nombre}</h4>
                           <span className="text-[10px] bg-gray-200 px-2 py-1 rounded-full text-gray-500">{b.categoria}</span>
                        </div>
                        <span className="text-xl">👉</span>
                     </button>
                   ))}
                 </div>
               ) : (
                 <div className="animate-fadeIn">
                    <button onClick={() => setAdminSelectedBizId(null)} className="mb-6 text-[10px] font-black uppercase text-blue-500 hover:underline">⬅ Volver a lista</button>
                    <h3 className="text-xl font-black uppercase text-black mb-2">Editando: {businesses.find(b => b.id === adminSelectedBizId)?.nombre}</h3>
                    
                    {/* REUSE TOOLS MANAGER FOR ADMIN */}
                    <ToolsManager bizId={adminSelectedBizId} />
                 </div>
               )}
            </div>
          </div>
        )}
      </main>

      {/* CARRITO FLOTANTE */}
      {cartTotal > 0 && selectedBusinessId && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-md animate-scaleIn">
           <button onClick={handleCheckout} className="w-full bg-black text-white p-8 rounded-[45px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] flex justify-between items-center border-b-[10px] border-orange-600 group active:scale-95 transition-all">
              <div className="flex items-center gap-6">
                 <div className="bg-orange-600 w-16 h-16 rounded-[24px] flex items-center justify-center text-2xl shadow-xl group-hover:rotate-12 transition-all">🛒</div>
                 <div className="text-left">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.3em] mb-1">Tu Selección</p>
                    <h5 className="text-2xl font-black italic uppercase text-white">Total: ${cartTotal.toFixed(2)}</h5>
                 </div>
              </div>
              <span className="text-xs font-black uppercase italic bg-orange-600 px-8 py-4 rounded-[20px] shadow-lg group-hover:scale-105 transition-all">Pedir WA 🚀</span>
           </button>
        </div>
      )}

      <footer className="bg-black text-white p-12 text-center border-t-[10px] border-orange-600 mt-10">
        <div className="text-[11px] font-black uppercase tracking-[0.5em] text-orange-500 italic mb-2">CALLE DEL HAMBRE - v4.6 RADAR & CAMPAIGN ACTIVE</div>
        <p className="text-[8px] text-white/30 uppercase font-bold tracking-[0.4em] mb-4">Geofencing Radius: 2.0km | Scanner: Gemini Vision | Commerce: WhatsApp</p>
        <div className="flex justify-center gap-6">
           <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Offline Ready</span>
           <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">IA Powered</span>
           <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Direct Delivery</span>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pushIn { from { opacity: 0; transform: translate(-50%, -30px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .animate-pushIn { animation: pushIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .animate-scaleIn { animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .form-input { 
          background-color: #F8F8F8 !important; padding: 18px 24px !important; border: 3px solid transparent !important; width: 100%; border-radius: 22px; font-weight: 800; outline: none; transition: all 0.2s; color: black;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; box-shadow: 0 10px 20px -5px rgba(234, 88, 12, 0.1); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .u-marker { background: none !important; border: none !important; }
        .b-marker { background: none !important; border: none !important; }
        .leaflet-popup-content-wrapper { border-radius: 30px !important; padding: 10px !important; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3) !important; border: 2px solid #f3f4f6 !important; }
        .leaflet-popup-tip { background: white !important; }
      `}} />
    </div>
  );
};

export default App;