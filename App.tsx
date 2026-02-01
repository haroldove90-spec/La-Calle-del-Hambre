
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
  const [activeTab, setActiveTab] = useState<string>('cupones');
  
  // --- ESTADO DE DATOS ---
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [metrics, setMetrics] = useState<{whatsapp: number, maps: number, views: number}>({ whatsapp: 0, maps: 0, views: 0 });
  const [userLocation, setUserLocation] = useState<GeoPoint>(DEFAULT_LOCATION);
  const [isGPSEnabled, setIsGPSEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false); // Sincronización en segundo plano
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [menuModalUrl, setMenuModalUrl] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPromoManager, setShowPromoManager] = useState(false);
  
  // --- ESTADO DE NOTIFICACIÓN RADAR ---
  const [activePromoNotif, setActivePromoNotif] = useState<{promo: Promotion, biz: Business} | null>(null);

  // Formulario de registro/edición
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({
    nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: DEFAULT_LOCATION, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00'
  });

  const [promoFormData, setPromoFormData] = useState<Partial<Promotion>>({
    mensaje: '¡Pasa por tu descuento!', radio_km: 2, frecuencia_horas: 4, activa: true, imagen_url: ''
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
      const [bRes, cRes, pRes] = await Promise.all([
        supabase.from('negocios').select('*'),
        supabase.from('cupones').select('*'),
        supabase.from('promociones').select('*')
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
      setCoupons((cRes.data || []).map(c => ({
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
        const myPromo = (pRes.data || []).find(p => p.id_negocio === myId);
        if (myPromo) setPromoFormData(myPromo);
      }
    } catch (e) {
      console.error("Error fetching data:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- FIX: Added handleSaveBusiness function ---
  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    try {
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
      
      setBizFormData({
        nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: DEFAULT_LOCATION, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00'
      });
      await fetchAllData();
      alert('Negocio registrado con éxito');
    } catch (err) {
      console.error("Error saving business:", err);
      alert('Error al guardar el negocio en Supabase');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- RADAR EN SEGUNDO PLANO CON RETARDO DE 5s ---
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
        } catch (e) {
          console.error("Error radar background:", e);
        }
      };

      // Iniciar radar con retardo para no estresar el render inicial
      const timerId = setTimeout(() => {
        verificarRadar(); // Ejecución inicial tras 5s
        const intervalId = setInterval(verificarRadar, 60000);
        return () => clearInterval(intervalId);
      }, 5000);

      return () => clearTimeout(timerId);
    }
  }, [userRole, promotions.length, businesses.length, userLocation]);

  // GPS Fallback y seguimiento
  useEffect(() => { 
    if (userRole) {
      fetchAllData();
      
      if (navigator.geolocation) {
        // Intento con timeout de 3s para fallback rápido
        const fastId = setTimeout(() => {
          if (!isGPSEnabled) {
            console.warn("GPS timeout: Usando Izcalli por defecto");
            setUserLocation(DEFAULT_LOCATION);
          }
        }, 3000);

        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            clearTimeout(fastId);
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setIsGPSEnabled(true);
          },
          () => {
            clearTimeout(fastId);
            setUserLocation(DEFAULT_LOCATION);
          },
          { enableHighAccuracy: false, timeout: 10000 }
        );
        return () => {
          clearTimeout(fastId);
          navigator.geolocation.clearWatch(watchId);
        };
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
                     target="_blank" class="flex items-center justify-center gap-1 w-full bg-orange-600 text-white text-[9px] font-black py-2.5 rounded-lg uppercase italic shadow-lg">📍 Ir</a>
                </div>
              </div>
            `;
            marker.bindPopup(popupContent, { closeButton: false, offset: [0, -10] });
          });

          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } catch (e) {
          console.error("Error mapa:", e);
        }
      };
      setTimeout(initMap, 200);
    }
  }, [activeTab, userLocation, businesses.length, userRole]);

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

  const myBusiness = useMemo(() => {
    if (userRole === 'PATROCINADOR') return businesses[0]; 
    return null;
  }, [businesses, userRole]);

  useEffect(() => {
    if (userRole && tabs.length > 0 && !tabs.find(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [userRole, tabs]);

  const sortedBusinesses = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    const filtered = businesses.filter(b => 
      b.nombre.toLowerCase().includes(lowerSearch) || 
      b.categoria.toLowerCase().includes(lowerSearch)
    );
    return [...filtered].sort((a, b) => {
      const distA = calculateDistance(userLocation.lat, userLocation.lng, a.coordenadas.lat, a.coordenadas.lng);
      const distB = calculateDistance(userLocation.lat, userLocation.lng, b.coordenadas.lat, b.coordenadas.lng);
      return distA - distB;
    });
  }, [businesses, searchTerm, userLocation]);

  const selectedBusiness = useMemo(() => businesses.find(b => b.id === selectedBusinessId), [selectedBusinessId, businesses]);
  const businessCoupons = useMemo(() => coupons.filter(c => c.idNegocio === selectedBusinessId), [selectedBusinessId, coupons]);

  const handleGoToPromo = () => {
    if (activePromoNotif) {
      const biz = activePromoNotif.biz;
      setActiveTab('geofencing');
      setActivePromoNotif(null);
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.setView([biz.coordenadas.lat, biz.coordenadas.lng], 17);
        }
      }, 300);
    }
  };

  const probarNotificacion = () => {
    if (businesses.length > 0) {
      if (audioRef.current) audioRef.current.play().catch(() => {});
      setActivePromoNotif({
        promo: { id: 'test', id_negocio: businesses[0].id, radio_km: 2, mensaje: '¡PROBANDO RADAR! 🍔🔥', frecuencia_horas: 1, activa: true },
        biz: businesses[0]
      });
    }
  };

  if (!userRole) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#111] p-10 rounded-[60px] border border-orange-600/30 text-center shadow-2xl animate-fadeIn">
          <span className="text-7xl block mb-6">🍔</span>
          <h1 className="text-3xl font-black text-orange-500 italic uppercase mb-2 leading-none">Calle del Hambre</h1>
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
                 <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-inner flex-shrink-0 bg-gray-100">
                    <img src={activePromoNotif.promo.imagen_url || activePromoNotif.biz.imagenMenu || 'https://via.placeholder.com/150'} className="w-full h-full object-cover" />
                 </div>
                 <div className="flex-1">
                    <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest block mb-1">¡Oferta Cerca! ⚡️</span>
                    <h4 className="text-xl font-black italic uppercase text-black leading-tight mb-1">{activePromoNotif.biz.nombre}</h4>
                    <p className="text-sm font-bold text-gray-500 leading-tight">{activePromoNotif.promo.mensaje}</p>
                 </div>
              </div>
              <div className="px-6 pb-6">
                 <button onClick={handleGoToPromo} className="w-full bg-orange-600 text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-black uppercase italic text-sm shadow-xl hover:bg-orange-700 transition-all">
                    🚀 ¡Ir ahora!
                 </button>
              </div>
           </div>
        </div>
      )}

      <header className="bg-black text-white p-6 flex items-center justify-between border-b-4 border-orange-600">
        <div className="flex items-center gap-4">
          <span className="text-3xl">🍔</span>
          <h1 className="text-2xl font-black uppercase italic text-orange-500">Calle del Hambre</h1>
        </div>
        <button onClick={() => setUserRole(null)} className="text-[9px] font-black uppercase bg-white/10 px-3 py-2 rounded-full">Salir</button>
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
            <div className="bg-white p-4 rounded-[40px] shadow-2xl">
              <div id="map" className="overflow-hidden min-h-[450px]"></div>
            </div>
          )}

          {activeTab === 'mi_dashboard' && (
            <div className="bg-white p-8 rounded-[40px] shadow-2xl border-l-[10px] border-orange-600 space-y-8">
              <div className="flex justify-between items-center flex-wrap gap-4">
                 <h2 className="text-3xl font-black italic uppercase">Mi Dashboard</h2>
                 <div className="flex gap-2">
                    <button onClick={probarNotificacion} className="bg-gray-200 text-black px-4 py-2 rounded-full font-black text-[9px] uppercase">Test Radar 🔔</button>
                    <button onClick={() => setShowPromoManager(!showPromoManager)} className="bg-orange-600 text-white px-6 py-2 rounded-full font-black text-[9px] uppercase shadow-md">Lanzar Promo ⚡️</button>
                 </div>
              </div>
              
              {isSyncing && <p className="text-[9px] font-black uppercase text-orange-600 animate-pulse italic">Actualizando métricas en tiempo real...</p>}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 bg-orange-50 rounded-3xl text-center border border-orange-100">
                   <h5 className="text-3xl font-black text-orange-600">{metrics.views}</h5>
                   <p className="text-[9px] font-black uppercase text-gray-400">Vistas</p>
                </div>
                <div className="p-6 bg-green-50 rounded-3xl text-center border border-green-100">
                   <h5 className="text-3xl font-black text-green-600">{metrics.whatsapp}</h5>
                   <p className="text-[9px] font-black uppercase text-gray-400">WhatsApp</p>
                </div>
                <div className="p-6 bg-blue-50 rounded-3xl text-center border border-blue-100">
                   <h5 className="text-3xl font-black text-blue-600">{metrics.maps}</h5>
                   <p className="text-[9px] font-black uppercase text-gray-400">Mapas</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cupones' && (
            <div className="space-y-8">
              {selectedBusinessId === null ? (
                <>
                  <div className="bg-black p-8 rounded-[40px] flex items-center justify-between gap-4">
                    <h2 className="text-3xl font-black text-orange-500 italic uppercase leading-none">LA CALLE</h2>
                    <input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-1/2 px-4 py-3 bg-[#F0F0F0] rounded-full text-sm font-bold outline-none"/>
                  </div>
                  
                  {isSyncing && businesses.length === 0 ? (
                    <div className="text-center py-20 font-black text-orange-600 animate-pulse italic">BUSCANDO NEGOCIOS...</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                      {sortedBusinesses.map(b => (
                        <div key={b.id} className="bg-white rounded-[35px] shadow-xl border border-gray-100 overflow-hidden flex flex-col hover:-translate-y-1 transition-transform">
                          <div className="h-40 bg-gray-200 cursor-pointer" onClick={() => setSelectedBusinessId(b.id)}>
                            <img src={b.imagenMenu || 'https://picsum.photos/400/600'} className="w-full h-full object-cover" />
                          </div>
                          <div className="p-5 flex-1 flex flex-col justify-between">
                            <h4 className="text-lg font-black italic uppercase truncate">{b.nombre}</h4>
                            <div className="grid grid-cols-2 gap-2 mt-4">
                              <a href={`https://wa.me/${b.telefono}`} target="_blank" onClick={() => logMetric(b.id, 'whatsapp')} className="bg-[#25D366] text-white py-2 rounded-xl text-center font-black text-[9px] uppercase">WhatsApp</a>
                              <button onClick={() => setSelectedBusinessId(b.id)} className="bg-black text-white py-2 rounded-xl font-black text-[9px] uppercase">Detalles</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="animate-fadeIn space-y-6">
                  <button onClick={() => setSelectedBusinessId(null)} className="font-black text-[10px] uppercase italic text-orange-600">⬅ VOLVER AL LISTADO</button>
                  <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row">
                    <div className="md:w-1/2 h-64 md:h-auto">
                       <img src={selectedBusiness?.imagenMenu || 'https://picsum.photos/800/600'} className="w-full h-full object-cover" />
                    </div>
                    <div className="md:w-1/2 p-8 space-y-6">
                      <h2 className="text-3xl font-black italic uppercase">{selectedBusiness?.nombre}</h2>
                      <div className="space-y-3">
                        <h5 className="text-[10px] font-black uppercase text-orange-600 tracking-widest">Cupones de Hoy</h5>
                        {isSyncing && businessCoupons.length === 0 ? <p className="animate-pulse">Cargando ofertas...</p> : (
                          businessCoupons.length === 0 ? <p className="text-gray-300 italic">No hay ofertas activas.</p> : businessCoupons.map(c => (
                            <div key={c.id} className="bg-black text-white p-5 rounded-3xl flex items-center justify-between">
                              <h4 className="text-sm font-black italic uppercase">{c.descripcionDescuento}</h4>
                              {!activeCoupon || activeCoupon.id !== c.id ? (
                                <button onClick={() => setActiveCoupon(c)} className="bg-orange-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase">VER QR</button>
                              ) : (
                                <div className="bg-white p-1 rounded-lg"><QRCodeSVG value={c.codigoQR} size={40} /></div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'registro' && (
            <div className="max-w-xl mx-auto bg-white p-10 rounded-[40px] shadow-2xl">
              <h2 className="text-2xl font-black italic uppercase mb-8">Registrar Aliado</h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-6 italic">Completa el perfil comercial</p>
              <form onSubmit={handleSaveBusiness} className="space-y-4">
                 <input placeholder="Nombre Comercial" value={bizFormData.nombre} onChange={e => setBizFormData({...bizFormData, nombre: e.target.value})} className="form-input" required />
                 <textarea placeholder="Descripción del producto" value={bizFormData.descripcion} onChange={e => setBizFormData({...bizFormData, descripcion: e.target.value})} className="form-input h-24" required />
                 <button type="submit" className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase italic shadow-xl">Guardar en Base de Datos</button>
              </form>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-black text-white p-8 text-center border-t-[8px] border-orange-600 mt-6">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500 italic">CALLE DEL HAMBRE - STABLE v2.5</div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pushIn { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .animate-pushIn { animation: pushIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .form-input { 
          background-color: #F0F0F0 !important; padding: 12px 16px !important; border: 2px solid transparent !important; width: 100%; border-radius: 12px; font-weight: 700; outline: none; transition: all 0.2s; font-size: 13px; color: black;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
};

export default App;
