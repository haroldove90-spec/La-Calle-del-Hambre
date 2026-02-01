
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { QRCodeSVG } from 'https://esm.sh/qrcode.react';
import { Business, GeoPoint, BusinessCategory, Coupon, UserRole, Promotion } from './types.ts';

// Declaración para Leaflet (L está en el window)
declare const L: any;

// CONFIGURACIÓN SUPABASE
const SUPABASE_URL = 'https://zgsgdzuonyvqveydklfg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnc2dkenVvbnl2cXZleWRrbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjczMTIsImV4cCI6MjA4NTU0MzMxMn0.zkmAedF2ABBcfBND3XT3u2dVpEMGjJAfUQS7TvO_6YQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const [activeTab, setActiveTab] = useState<string>('cupones');
  
  // --- ESTADO DE DATOS ---
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [metrics, setMetrics] = useState<{whatsapp: number, maps: number, views: number}>({ whatsapp: 0, maps: 0, views: 0 });
  const [userLocation, setUserLocation] = useState<GeoPoint>({ lat: 19.6468, lng: -99.2255 });
  const [isGPSEnabled, setIsGPSEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [menuModalUrl, setMenuModalUrl] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPromoManager, setShowPromoManager] = useState(false);
  
  // Formulario de registro/edición
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({
    nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: { lat: 19.6366, lng: -99.2155 }, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00'
  });

  const [promoFormData, setPromoFormData] = useState<Partial<Promotion>>({
    mensaje: '¡Pasa por tu descuento!', radio_km: 2, frecuencia_horas: 4, activa: true
  });
  
  const mapRef = useRef<any>(null);
  const notifiedPromosRef = useRef<Set<string>>(new Set());

  // --- LOGICA DE MÉTRICAS ---
  const logMetric = async (bizId: string, eventType: 'whatsapp' | 'maps' | 'view') => {
    try {
      await supabase.from('metricas').insert([{ id_negocio: bizId, tipo_evento: eventType }]);
    } catch (e) {
      console.error("Error logging metric:", e);
    }
  };

  // Exponer funciones globales para Leaflet
  useEffect(() => {
    (window as any).selectBusinessFromMap = (id: string) => {
      logMetric(id, 'view');
      setSelectedBusinessId(id);
      setActiveTab('cupones');
    };
    (window as any).logMapsClick = (id: string) => logMetric(id, 'maps');
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const { data: bData, error: bError } = await supabase.from('negocios').select('*');
      const { data: cData, error: cError } = await supabase.from('cupones').select('*');
      const { data: pData, error: pError } = await supabase.from('promociones').select('*');
      
      if (bError) console.error("Error al cargar negocios:", bError);
      if (cError) console.error("Error al cargar cupones:", cError);
      if (pError) console.error("Error al cargar promociones:", pError);

      const parsedBiz = (bData || []).map(b => ({
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
      setPromotions(pData || []);
      setCoupons((cData || []).map(c => ({
        id: c.id, 
        idNegocio: c.id_negocio, 
        descripcionDescuento: c.descripcion_descuento, 
        codigoQR: c.codigo_qr, 
        fechaExpiracion: c.fecha_expiracion
      })));

      if (userRole === 'PATROCINADOR' && parsedBiz.length > 0) {
        const myId = parsedBiz[0].id;
        const { data: mData } = await supabase.from('metricas').select('tipo_evento').eq('id_negocio', myId);
        if (mData) {
          const counts = mData.reduce((acc: any, curr: any) => {
            acc[curr.tipo_evento] = (acc[curr.tipo_evento] || 0) + 1;
            return acc;
          }, { whatsapp: 0, maps: 0, view: 0 });
          setMetrics({ whatsapp: counts.whatsapp, maps: counts.maps, views: counts.view });
        }
        // Cargar campaña activa del dueño
        const myPromo = (pData || []).find(p => p.id_negocio === myId);
        if (myPromo) setPromoFormData(myPromo);
      }
    } catch (e) {
      console.error("Excepción en fetchAllData:", e);
    } finally { setLoading(false); }
  };

  // --- RADAR DE GEOFENCING ---
  useEffect(() => {
    if (userRole === 'CLIENTE' && promotions.length > 0) {
      const checkNearbyPromos = () => {
        promotions.forEach(promo => {
          if (!promo.activa) return;
          const biz = businesses.find(b => b.id === promo.id_negocio);
          if (!biz) return;

          const dist = calculateDistance(userLocation.lat, userLocation.lng, biz.coordenadas.lat, biz.coordenadas.lng);
          if (dist <= promo.radio_km && !notifiedPromosRef.current.has(promo.id)) {
            // Activar notificación
            if (Notification.permission === 'granted') {
              new Notification(`¡Promo en ${biz.nombre}!`, {
                body: promo.mensaje,
                icon: 'https://cdn-icons-png.flaticon.com/512/599/599502.png'
              });
              notifiedPromosRef.current.add(promo.id);
              // Resetear después de X horas según frecuencia
              setTimeout(() => notifiedPromosRef.current.delete(promo.id), promo.frecuencia_horas * 3600000);
            }
          }
        });
      };

      const interval = setInterval(checkNearbyPromos, 30000); // Revisar cada 30s
      return () => clearInterval(interval);
    }
  }, [userRole, promotions, userLocation, businesses]);

  useEffect(() => { 
    if (userRole) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
      fetchAllData();
      if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setIsGPSEnabled(true);
          },
          (err) => console.warn("GPS watch error:", err.message),
          { enableHighAccuracy: true }
        );
        return () => navigator.geolocation.clearWatch(watchId);
      }
    }
  }, [userRole]);

  // Lógica de Mapa
  useEffect(() => {
    if (activeTab === 'geofencing' && !loading && userRole) {
      const initMap = () => {
        if (mapRef.current) mapRef.current.remove();
        const map = L.map('map');
        mapRef.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        const bounds = L.latLngBounds([userLocation.lat, userLocation.lng]);

        L.marker([userLocation.lat, userLocation.lng], {
          icon: L.divIcon({
            className: 'user-marker',
            html: '<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(59,130,246,0.8);"></div>'
          })
        }).addTo(map).bindPopup('<b class="font-sans text-[10px] uppercase">Tu Ubicación</b>');

        businesses.forEach(b => {
          const open = isBusinessOpen(b.hora_apertura, b.hora_cierre);
          const markerLocation = [b.coordenadas.lat, b.coordenadas.lng];
          bounds.extend(markerLocation);

          const marker = L.marker(markerLocation).addTo(map);
          const popupContent = `
            <div class="p-2 font-sans min-w-[140px]">
              <h3 class="font-black uppercase italic text-orange-600 leading-tight">${b.nombre}</h3>
              <p class="text-[9px] font-black ${open ? 'text-green-500' : 'text-red-500'} mb-3">
                ${open ? '● ABIERTO' : '● CERRADO'}
              </p>
              <div class="space-y-2">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${b.coordenadas.lat},${b.coordenadas.lng}" 
                   onclick="window.logMapsClick('${b.id}')"
                   target="_blank" class="flex items-center justify-center gap-1 w-full bg-orange-600 text-white text-[9px] font-black py-2.5 rounded-lg uppercase italic shadow-lg">📍 Cómo llegar</a>
                <button onclick="window.selectBusinessFromMap('${b.id}')" class="w-full bg-black text-white text-[9px] font-black py-2 rounded-lg uppercase italic shadow">Ver Detalles</button>
              </div>
            </div>
          `;
          marker.bindPopup(popupContent, { closeButton: false, offset: [0, -10] });
        });

        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      };
      setTimeout(initMap, 100);
    }
  }, [activeTab, loading, userLocation, businesses, userRole]);

  // Filtrado de pestañas por Rol
  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'geofencing', label: 'MAPA REAL', roles: ['CLIENTE', 'PATROCINADOR', 'ADMIN'] },
      { id: 'cupones', label: 'CUPONES Y ANTOJOS', roles: ['CLIENTE', 'ADMIN'] },
      { id: 'mi_dashboard', label: 'MI DASHBOARD', roles: ['PATROCINADOR'] },
      { id: 'admin_cupones', label: 'GENERAL MÉTRICAS', roles: ['ADMIN'] },
      { id: 'registro', label: 'NUEVO PUNTO', roles: ['ADMIN'] },
      { id: 'schema', label: 'DATOS', roles: ['ADMIN'] },
    ];
    return baseTabs.filter(tab => tab.roles.includes(userRole || ''));
  }, [userRole]);

  // Negocio del patrocinador
  const myBusiness = useMemo(() => {
    if (userRole === 'PATROCINADOR') return businesses[0]; // Simulación
    return null;
  }, [businesses, userRole]);

  useEffect(() => {
    if (userRole && tabs.length > 0) setActiveTab(tabs[0].id);
  }, [userRole, tabs]);

  const sortedBusinesses = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    const filtered = businesses.filter(b => 
      b.nombre.toLowerCase().includes(lowerSearch) || 
      b.categoria.toLowerCase().includes(lowerSearch)
    );
    if (isGPSEnabled) {
      return [...filtered].sort((a, b) => {
        const distA = calculateDistance(userLocation.lat, userLocation.lng, a.coordenadas.lat, a.coordenadas.lng);
        const distB = calculateDistance(userLocation.lat, userLocation.lng, b.coordenadas.lat, b.coordenadas.lng);
        return distA - distB;
      });
    }
    return filtered;
  }, [businesses, searchTerm, isGPSEnabled, userLocation]);

  const selectedBusiness = useMemo(() => businesses.find(b => b.id === selectedBusinessId), [selectedBusinessId, businesses]);
  const businessCoupons = useMemo(() => coupons.filter(c => c.idNegocio === selectedBusinessId), [selectedBusinessId, coupons]);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Guardando local...");
    try {
      const isNew = !bizFormData.id;
      if (isNew) {
        const { error } = await supabase.from('negocios').insert([
          { ...bizFormData, lat: bizFormData.coordenadas?.lat, lng: bizFormData.coordenadas?.lng, owner_id: 'current_user' }
        ]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('negocios').update({
          imagen_menu: bizFormData.imagenMenu,
          hora_apertura: bizFormData.hora_apertura,
          hora_cierre: bizFormData.hora_cierre,
          descripcion: bizFormData.descripcion,
          telefono: bizFormData.telefono
        }).eq('id', bizFormData.id);
        if (error) throw error;
      }
      setSaveStatus("✅ ¡ÉXITO!");
      setIsEditing(false);
      fetchAllData();
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      setSaveStatus("❌ ERROR: " + err.message);
    }
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myBusiness) return;
    setSaveStatus("Lanzando campaña...");
    try {
      const { data: existing } = await supabase.from('promociones').select('*').eq('id_negocio', myBusiness.id).maybeSingle();
      if (existing) {
        await supabase.from('promociones').update({ ...promoFormData }).eq('id', existing.id);
      } else {
        await supabase.from('promociones').insert([{ ...promoFormData, id_negocio: myBusiness.id }]);
      }
      setSaveStatus("🚀 ¡CAMPAÑA ACTIVA!");
      setShowPromoManager(false);
      fetchAllData();
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      setSaveStatus("❌ ERROR: " + err.message);
    }
  };

  const startEditing = () => {
    if (myBusiness) {
      setBizFormData({ ...myBusiness });
      setIsEditing(true);
    }
  };

  // --- RENDERIZADO ---

  if (!userRole) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#111] p-10 rounded-[60px] border border-orange-600/30 text-center shadow-2xl animate-fadeIn">
          <span className="text-7xl block mb-6">🍔</span>
          <h1 className="text-3xl font-black text-orange-500 italic uppercase italic mb-2 leading-none">Calle del Hambre</h1>
          <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase mb-10">Selecciona tu perfil para continuar</p>
          <div className="space-y-4">
            <button onClick={() => setUserRole('CLIENTE')} className="w-full bg-white text-black py-5 rounded-[25px] font-black uppercase italic hover:bg-orange-500 hover:text-white transition-all">Soy Comensal 😋</button>
            <button onClick={() => setUserRole('PATROCINADOR')} className="w-full bg-[#222] text-white py-5 rounded-[25px] font-black uppercase italic hover:border-orange-600 border border-transparent transition-all">Tengo un Negocio 🏪</button>
            <button onClick={() => setUserRole('ADMIN')} className="w-full py-3 text-orange-500/50 text-[10px] font-black uppercase tracking-widest hover:text-orange-500 transition-colors">Admin Access</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative overflow-x-hidden">
      
      {/* MODAL VER MENÚ */}
      {menuModalUrl !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 animate-fadeIn" onClick={() => setMenuModalUrl(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuModalUrl(null)} className="absolute -top-12 right-0 text-white font-black text-4xl hover:text-orange-500 transition-colors">✕</button>
            <img src={menuModalUrl || 'https://via.placeholder.com/400'} className="w-full h-full object-contain rounded-2xl shadow-2xl" alt="Menú" />
          </div>
        </div>
      )}

      <header className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between border-b-4 border-orange-600 gap-4">
        <div className="flex items-center gap-4">
          <span className="text-4xl">🍔</span>
          <div>
            <h1 className="text-3xl font-black uppercase italic text-orange-500 leading-none">Calle del Hambre</h1>
            <p className="text-[10px] font-bold opacity-70 tracking-[0.2em] uppercase mt-1">Perfil: {userRole}</p>
          </div>
        </div>
        <button onClick={() => {setUserRole(null); setActiveTab('cupones');}} className="bg-white/10 hover:bg-red-600 px-4 py-2 rounded-full text-[9px] font-black uppercase transition-all">Cerrar Sesión</button>
      </header>

      <nav className="bg-white border-b sticky top-0 z-[80] shadow-md w-full overflow-hidden">
        <div className="nav-scroll-container">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedBusinessId(null); setIsEditing(false); setShowPromoManager(false); }}
              className={`nav-tab-button ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-7xl">
        {loading && <div className="text-center py-20 font-black text-orange-600 animate-pulse italic uppercase tracking-[0.3em]">Cargando...</div>}
        
        {!loading && (
          <div className="animate-fadeIn">
            {activeTab === 'geofencing' && (
              <div className="max-w-5xl mx-auto space-y-8">
                <div className="bg-white p-6 md:p-10 rounded-[50px] shadow-2xl border border-gray-100">
                  <div id="map" className="overflow-hidden"></div>
                </div>
              </div>
            )}

            {activeTab === 'mi_dashboard' && (
              <div className="max-w-5xl mx-auto space-y-8">
                <div className="bg-white p-10 rounded-[50px] shadow-2xl border-l-[15px] border-orange-600">
                   <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
                      <h2 className="text-4xl font-black italic uppercase">Mi Dashboard</h2>
                      <div className="flex gap-4">
                        <button onClick={() => setShowPromoManager(!showPromoManager)} className="bg-orange-600 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase shadow-lg">Lanzar Campaña 📡</button>
                        {!isEditing && <button onClick={startEditing} className="bg-black text-white px-8 py-3 rounded-full font-black text-[10px] uppercase">Ajustar Local</button>}
                      </div>
                   </div>

                   {showPromoManager ? (
                     <div className="bg-orange-50 p-10 rounded-[40px] border-2 border-orange-100 mb-8 animate-fadeIn">
                        <h3 className="text-xl font-black uppercase italic mb-6">Radar de Notificaciones Push</h3>
                        <form onSubmit={handleSavePromo} className="space-y-6">
                           <label className="block">
                              <span className="text-[10px] font-black uppercase text-orange-600 block mb-2">Mensaje de Notificación</span>
                              <input value={promoFormData.mensaje} onChange={e => setPromoFormData({...promoFormData, mensaje: e.target.value})} className="form-input" placeholder="¡Ven por tu 2x1!" />
                           </label>
                           <div className="grid grid-cols-2 gap-4">
                              <label>
                                <span className="text-[10px] font-black uppercase text-orange-600 block mb-2">Radio (KM)</span>
                                <input type="number" step="0.5" value={promoFormData.radio_km} onChange={e => setPromoFormData({...promoFormData, radio_km: Number(e.target.value)})} className="form-input" />
                              </label>
                              <label>
                                <span className="text-[10px] font-black uppercase text-orange-600 block mb-2">Frecuencia (Horas)</span>
                                <input type="number" value={promoFormData.frecuencia_horas} onChange={e => setPromoFormData({...promoFormData, frecuencia_horas: Number(e.target.value)})} className="form-input" />
                              </label>
                           </div>
                           <div className="flex items-center gap-4 py-4">
                              <input type="checkbox" checked={promoFormData.activa} onChange={e => setPromoFormData({...promoFormData, activa: e.target.checked})} className="w-6 h-6 accent-orange-600" id="promo-active" />
                              <label htmlFor="promo-active" className="font-black uppercase italic text-sm">Campaña Activa en Radar</label>
                           </div>
                           <button type="submit" className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase italic shadow-2xl">ACTIVAR LANZAMIENTO</button>
                        </form>
                     </div>
                   ) : null}

                   {isEditing ? (
                      <form onSubmit={handleSaveBusiness} className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <label>
                              <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">Imagen del Menú (URL)</span>
                              <input value={bizFormData.imagenMenu} onChange={e => setBizFormData({...bizFormData, imagenMenu: e.target.value})} className="form-input" />
                           </label>
                           <label>
                              <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">WhatsApp de Pedidos</span>
                              <input value={bizFormData.telefono} onChange={e => setBizFormData({...bizFormData, telefono: e.target.value})} className="form-input" />
                           </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <label>
                              <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">Apertura</span>
                              <input type="time" value={bizFormData.hora_apertura} onChange={e => setBizFormData({...bizFormData, hora_apertura: e.target.value})} className="form-input" />
                           </label>
                           <label>
                              <span className="text-[10px] font-black uppercase mb-2 block text-gray-400">Cierre</span>
                              <input type="time" value={bizFormData.hora_cierre} onChange={e => setBizFormData({...bizFormData, hora_cierre: e.target.value})} className="form-input" />
                           </label>
                        </div>
                        <div className="flex gap-4">
                           <button type="submit" className="flex-1 bg-orange-600 text-white py-4 rounded-2xl font-black uppercase italic shadow-xl">Guardar Cambios</button>
                           <button type="button" onClick={() => setIsEditing(false)} className="px-8 bg-gray-200 py-4 rounded-2xl font-black uppercase italic">Cancelar</button>
                        </div>
                        {saveStatus && <p className="text-center font-black uppercase italic text-orange-600 animate-pulse">{saveStatus}</p>}
                      </form>
                   ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                            <div className="p-8 bg-orange-50 rounded-[40px] text-center border border-orange-100 shadow-sm">
                               <h5 className="text-4xl font-black text-orange-600 mb-1">{metrics.views}</h5>
                               <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Total de Vistas</p>
                            </div>
                            <div className="p-8 bg-green-50 rounded-[40px] text-center border border-green-100 shadow-sm">
                               <h5 className="text-4xl font-black text-green-600 mb-1">{metrics.whatsapp}</h5>
                               <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">WhatsApp Clics</p>
                            </div>
                            <div className="p-8 bg-blue-50 rounded-[40px] text-center border border-blue-100 shadow-sm">
                               <h5 className="text-4xl font-black text-blue-600 mb-1">{metrics.maps}</h5>
                               <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Rutas Trazadas</p>
                            </div>
                        </div>

                        {myBusiness && (
                          <div className="bg-gray-50 p-8 rounded-[40px] flex flex-col md:flex-row gap-8 items-center border border-gray-200">
                             <img src={myBusiness.imagenMenu} className="w-full md:w-64 h-40 object-cover rounded-3xl shadow-xl" />
                             <div className="flex-1 text-center md:text-left">
                                <h4 className="text-2xl font-black italic uppercase leading-none">{myBusiness.nombre}</h4>
                                <p className="text-gray-400 text-[11px] font-bold mt-2">{myBusiness.descripcion}</p>
                                <div className="mt-4 flex flex-wrap gap-4 justify-center md:justify-start">
                                   <div className="bg-white px-4 py-2 rounded-xl text-[9px] font-black border border-gray-100 uppercase">🕒 {myBusiness.hora_apertura} - {myBusiness.hora_cierre}</div>
                                   <div className="bg-white px-4 py-2 rounded-xl text-[9px] font-black border border-gray-100 uppercase">📞 {myBusiness.telefono}</div>
                                </div>
                             </div>
                          </div>
                        )}
                      </>
                   )}
                </div>
              </div>
            )}

            {activeTab === 'cupones' && (
              <div className="space-y-10">
                {selectedBusinessId === null ? (
                  <>
                    <div className="bg-black p-10 rounded-[60px] flex flex-col md:flex-row justify-between items-center gap-8 shadow-2xl">
                      <h2 className="text-5xl font-black text-orange-500 italic uppercase">LA CALLE</h2>
                      <input placeholder="Busca tu comida..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full max-w-md px-8 py-5 bg-[#F0F0F0] rounded-full font-black outline-none shadow-inner"/>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
                      {sortedBusinesses.map(b => (
                        <div key={b.id} className="group bg-white rounded-[40px] shadow-xl border border-gray-100 overflow-hidden flex flex-col hover:-translate-y-2 transition-transform">
                          <div className="h-44 bg-gray-200 relative cursor-pointer" onClick={() => { logMetric(b.id, 'view'); setSelectedBusinessId(b.id); }}>
                            <img src={b.imagenMenu || 'https://picsum.photos/400/600'} className="w-full h-full object-cover" />
                          </div>
                          <div className="p-6 flex-1 flex flex-col justify-between">
                            <h4 className="text-xl font-black text-black italic uppercase truncate">{b.nombre}</h4>
                            <div className="grid grid-cols-2 gap-2 mt-4">
                              <a href={`https://wa.me/${b.telefono}`} target="_blank" onClick={() => logMetric(b.id, 'whatsapp')} className="bg-[#25D366] text-white py-3 rounded-xl text-center font-black text-[9px] uppercase italic hover:brightness-110 transition-all">WhatsApp</a>
                              <button onClick={() => { logMetric(b.id, 'view'); setSelectedBusinessId(b.id); }} className="bg-black text-white py-3 rounded-xl font-black text-[9px] uppercase italic hover:bg-orange-600 transition-all">Ver Promos</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="animate-fadeIn space-y-8">
                    <button onClick={() => setSelectedBusinessId(null)} className="font-black text-[10px] uppercase italic text-orange-600 flex items-center gap-2">⬅ VOLVER AL DIRECTORIO</button>
                    <div className="bg-white rounded-[50px] shadow-2xl overflow-hidden flex flex-col lg:flex-row">
                      <div className="lg:w-1/2 h-[350px] lg:h-auto">
                         <img src={selectedBusiness?.imagenMenu || 'https://picsum.photos/800/600'} className="w-full h-full object-cover" />
                      </div>
                      <div className="lg:w-1/2 p-10 flex flex-col justify-center space-y-8">
                        <h2 className="text-4xl font-black italic uppercase leading-tight">{selectedBusiness?.nombre}</h2>
                        <p className="text-gray-400 font-bold text-sm italic">{selectedBusiness?.descripcion}</p>
                        <div className="space-y-4">
                          <h5 className="text-[10px] font-black uppercase text-orange-600 tracking-widest">Cupones Disponibles</h5>
                          {businessCoupons.length === 0 ? <p className="italic text-gray-300">No hay cupones hoy.</p> : businessCoupons.map(c => (
                            <div key={c.id} className="bg-black text-white p-6 rounded-[30px] flex items-center justify-between shadow-xl">
                              <h4 className="text-lg font-black italic uppercase">{c.descripcionDescuento}</h4>
                              {!activeCoupon || activeCoupon.id !== c.id ? (
                                <button onClick={() => setActiveCoupon(c)} className="bg-orange-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase hover:scale-105 transition-all">OBTENER</button>
                              ) : (
                                <div className="bg-white p-2 rounded-xl animate-fadeIn"><QRCodeSVG value={c.codigoQR} size={50} /></div>
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
            
            {activeTab === 'schema' && (
              <div className="max-w-4xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl">
                <h2 className="text-2xl font-black italic uppercase mb-8">Arquitectura de Notificaciones Radar (Supabase)</h2>
                <pre className="bg-gray-900 text-green-400 p-8 rounded-3xl overflow-auto font-mono text-[11px]">
{`TABLA: promociones (Radar Engine)
- id (uuid, primary key)
- id_negocio (uuid, fk -> negocios)
- radio_km (float8, default: 2.0)
- mensaje (text)
- frecuencia_horas (int, default: 4)
- activa (boolean, default: true)
- imagen_url (text)

LÓGICA DEL WORKER:
- Cliente trackea ubicación via navigator.geolocation.watchPosition
- useEffect compara distancia(User, Biz) < radio_km
- Si cumple, dispara Browser Push Notification (Web API)
- Aplica cooldown basado en frecuencia_horas`}
                </pre>
              </div>
            )}

            {activeTab === 'admin_cupones' && (
               <div className="max-w-4xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl space-y-8">
                  <h2 className="text-3xl font-black italic uppercase text-center">Dashboard Administrativo</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-6 bg-gray-50 rounded-3xl text-center"><h5 className="font-black text-2xl">{businesses.length}</h5><p className="text-[8px] font-black uppercase text-gray-400">Aliados</p></div>
                    <div className="p-6 bg-orange-50 rounded-3xl text-center"><h5 className="font-black text-2xl">1.2k</h5><p className="text-[8px] font-black uppercase text-orange-600">Views Global</p></div>
                    <div className="p-6 bg-green-50 rounded-3xl text-center"><h5 className="font-black text-2xl">{promotions.filter(p => p.activa).length}</h5><p className="text-[8px] font-black uppercase text-green-600">Radares ON</p></div>
                    <div className="p-6 bg-blue-50 rounded-3xl text-center"><h5 className="font-black text-2xl">54</h5><p className="text-[8px] font-black uppercase text-blue-600">Mapas</p></div>
                  </div>
                  <div className="overflow-hidden border border-gray-100 rounded-3xl">
                     <table className="w-full text-left text-[11px]">
                        <thead className="bg-gray-900 text-white uppercase font-black">
                           <tr><th className="p-4">Negocio</th><th className="p-4">WhatsApp</th><th className="p-4">Campaña</th></tr>
                        </thead>
                        <tbody>
                           {businesses.map(b => {
                             const promo = promotions.find(p => p.id_negocio === b.id);
                             return (
                               <tr key={b.id} className="border-b border-gray-50 hover:bg-orange-50/30 transition-colors">
                                  <td className="p-4 font-black italic uppercase">{b.nombre}</td>
                                  <td className="p-4 text-green-600 font-black">{b.telefono}</td>
                                  <td className="p-4 italic font-black text-[9px]">{promo?.activa ? '🟢 ACTIVA' : '⚪️ OFF'}</td>
                               </tr>
                             );
                           })}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}

            {activeTab === 'registro' && (
              <div className="max-w-3xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl">
                <h2 className="text-3xl font-black italic uppercase mb-10">Nuevo Punto de Venta</h2>
                <form onSubmit={handleSaveBusiness} className="space-y-6">
                   <input placeholder="Nombre del Negocio" value={bizFormData.nombre} onChange={e => setBizFormData({...bizFormData, nombre: e.target.value})} className="form-input" required />
                   <textarea placeholder="Descripción corta" value={bizFormData.descripcion} onChange={e => setBizFormData({...bizFormData, descripcion: e.target.value})} className="form-input h-32" required />
                   <button type="submit" className="w-full bg-black text-white py-5 rounded-[25px] font-black uppercase italic shadow-xl">Guardar Local 🚀</button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-black text-white p-12 text-center border-t-[10px] border-orange-600 mt-10">
        <div className="text-[12px] font-black uppercase tracking-[0.4em] text-orange-500 italic">📍 CALLE DEL HAMBRE - GEOFENCING RADAR v2.0</div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .form-input { 
          background-color: #F0F0F0 !important; padding: 14px 18px !important; border: 2px solid transparent !important; width: 100%; border-radius: 15px; font-weight: 700; outline: none; transition: all 0.2s; font-size: 14px; color: black;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; }
        .nav-scroll-container {
          display: flex !important; flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; gap: 10px; padding: 5px 15px; scrollbar-width: none; width: 100%;
        }
        .nav-tab-button {
          flex-shrink: 0; padding: 18px 20px; text-transform: uppercase; font-weight: 900; font-size: 10px; color: #9ca3af; border-bottom: 3px solid transparent; transition: all 0.3s ease; white-space: nowrap;
        }
        .nav-tab-button.active { color: #ea580c !important; border-bottom-color: #ea580c !important; }
        .leaflet-popup-content-wrapper { border-radius: 20px !important; padding: 4px !important; border-bottom: 4px solid #ea580c; }
        .leaflet-popup-tip-container { display: none; }
        .leaflet-div-icon { background: none !important; border: none !important; }
      `}} />
    </div>
  );
};

export default App;
