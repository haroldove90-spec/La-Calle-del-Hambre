
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { QRCodeSVG } from 'https://esm.sh/qrcode.react';
import { Business, GeoPoint, BusinessCategory, Coupon } from './types.ts';

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
  const [activeTab, setActiveTab] = useState<'schema' | 'geofencing' | 'registro' | 'cupones' | 'admin_cupones'>('cupones');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [userLocation, setUserLocation] = useState<GeoPoint>({ lat: 19.6468, lng: -99.2255 });
  const [isGPSEnabled, setIsGPSEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [menuModalUrl, setMenuModalUrl] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({
    nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: { lat: 19.6366, lng: -99.2155 }, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00'
  });
  const mapRef = useRef<any>(null);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const { data: bData, error: bError } = await supabase.from('negocios').select('*');
      const { data: cData, error: cError } = await supabase.from('cupones').select('*');
      
      if (bError) console.error("Error al cargar negocios de Supabase:", bError);
      if (cError) console.error("Error al cargar cupones de Supabase:", cError);

      if (!bData || bData.length === 0) {
        console.warn("La tabla 'negocios' está vacía o no se pudo leer. Revisa la API Key y los permisos RLS en Supabase.");
      }

      setBusinesses((bData || []).map(b => ({
        id: b.id, 
        nombre: b.nombre, 
        descripcion: b.descripcion, 
        coordenadas: { lat: b.lat, lng: b.lng }, 
        imagenMenu: b.imagen_menu || '', 
        categoria: b.categoria as BusinessCategory,
        telefono: b.telefono,
        hora_apertura: b.hora_apertura,
        hora_cierre: b.hora_cierre
      })));
      setCoupons((cData || []).map(c => ({
        id: c.id, 
        idNegocio: c.id_negocio, 
        descripcionDescuento: c.descripcion_descuento, 
        codigoQR: c.codigo_qr, 
        fechaExpiracion: c.fecha_expiracion
      })));
    } catch (e) {
      console.error("Excepción en fetchAllData:", e);
    } finally { setLoading(false); }
  };

  useEffect(() => { 
    fetchAllData();
    // Obtener ubicación real al inicio si es posible
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setIsGPSEnabled(true);
        },
        (err) => console.warn("No se pudo obtener GPS al inicio:", err.message)
      );
    }
  }, []);

  // Lógica para inicializar el mapa cuando se entra en la pestaña 'geofencing'
  useEffect(() => {
    if (activeTab === 'geofencing' && !loading) {
      const initMap = () => {
        if (mapRef.current) {
          mapRef.current.remove();
        }
        
        const map = L.map('map').setView([userLocation.lat, userLocation.lng], 15);
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // Marcador del usuario
        L.marker([userLocation.lat, userLocation.lng], {
          icon: L.divIcon({
            className: 'user-marker',
            html: '<div style="background-color: #3b82f6; width: 15px; height: 15px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>'
          })
        }).addTo(map).bindPopup('<b>Estás aquí</b>').openPopup();

        // Marcadores de negocios
        businesses.forEach(b => {
          const marker = L.marker([b.coordenadas.lat, b.coordenadas.lng]).addTo(map);
          const popupContent = `
            <div class="p-2 font-sans">
              <h3 class="font-black uppercase italic text-orange-600">${b.nombre}</h3>
              <p class="text-[10px] text-gray-500 mb-2">${b.categoria}</p>
              ${b.telefono ? `
                <a href="https://wa.me/${b.telefono.replace(/\+/g, '').replace(/\s/g, '')}" target="_blank" class="block text-center bg-[#25D366] text-white text-[9px] font-black py-2 rounded-lg uppercase italic mt-1">
                  Pedir por WhatsApp
                </a>
              ` : ''}
            </div>
          `;
          marker.bindPopup(popupContent);
        });
      };
      
      // Delay pequeño para asegurar que el div #map ya esté en el DOM
      setTimeout(initMap, 100);
    }
  }, [activeTab, loading, userLocation, businesses]);

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

  // Fix: Added handleSaveBusiness function to persist data to Supabase
  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Guardando local...");
    try {
      const { error } = await supabase.from('negocios').insert([
        {
          nombre: bizFormData.nombre,
          descripcion: bizFormData.descripcion,
          lat: bizFormData.coordenadas?.lat || 19.6366,
          lng: bizFormData.coordenadas?.lng || -99.2155,
          imagen_menu: bizFormData.imagenMenu,
          categoria: bizFormData.categoria,
          telefono: bizFormData.telefono,
          hora_apertura: bizFormData.hora_apertura,
          hora_cierre: bizFormData.hora_cierre
        }
      ]);

      if (error) throw error;

      setSaveStatus("✅ ¡NEGOCIO REGISTRADO CON ÉXITO!");
      setBizFormData({
        nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: { lat: 19.6366, lng: -99.2155 }, imagenMenu: '', telefono: '', hora_apertura: '10:00', hora_cierre: '22:00'
      });
      fetchAllData();
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      console.error("Error al guardar:", err);
      setSaveStatus("❌ ERROR: " + (err.message || "No se pudo guardar"));
      setTimeout(() => setSaveStatus(null), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative overflow-x-hidden">
      
      {/* MODAL VER MENÚ */}
      {menuModalUrl !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 animate-fadeIn" onClick={() => setMenuModalUrl(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuModalUrl(null)} className="absolute -top-12 right-0 text-white font-black text-4xl hover:text-orange-500 transition-colors">✕</button>
            {menuModalUrl ? (
              <img src={menuModalUrl} className="w-full h-full object-contain rounded-2xl shadow-2xl" alt="Menú" />
            ) : (
              <div className="bg-white p-20 rounded-3xl text-center">
                <span className="text-6xl mb-6 block">🚫</span>
                <p className="font-black uppercase text-black italic">Este local aún no ha subido su menú</p>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between border-b-4 border-orange-600 gap-4">
        <div className="flex items-center gap-4">
          <span className="text-4xl">🍔</span>
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-black uppercase italic text-orange-500 leading-none">Calle del Hambre <span className="text-white">App</span></h1>
            <p className="text-[10px] font-bold opacity-70 tracking-[0.2em] uppercase mt-1">Directorio Real-Time</p>
          </div>
        </div>
        <div className="bg-orange-600 px-5 py-2 rounded-full text-[10px] font-black italic shadow-lg uppercase animate-pulse tracking-widest">
           {isGPSEnabled ? "📡 RADAR ON" : "📍 IZCALLI CORE"}
        </div>
      </header>

      <nav className="bg-white border-b sticky top-0 z-[80] shadow-md w-full overflow-hidden">
        <div className="nav-scroll-container">
          {[
            { id: 'schema', label: 'DATOS' },
            { id: 'geofencing', label: 'MAPA REAL' },
            { id: 'registro', label: 'NUEVO PUNTO' },
            { id: 'cupones', label: 'CUPONES Y ANTOJOS' },
            { id: 'admin_cupones', label: 'MIS PROMOS' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setSelectedBusinessId(null); setActiveCoupon(null); }}
              className={`nav-tab-button ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-7xl">
        {loading && <div className="text-center py-20 font-black text-orange-600 animate-pulse italic uppercase tracking-[0.3em]">Cargando experiencia real...</div>}
        
        {!loading && (
          <div className="animate-fadeIn">
            {activeTab === 'geofencing' && (
              <div className="max-w-5xl mx-auto space-y-8">
                <div className="bg-white p-6 rounded-[50px] shadow-2xl border border-gray-100">
                  <h2 className="text-3xl font-black italic uppercase mb-6 text-center">Explora el Mapa</h2>
                  <div id="map" className="overflow-hidden"></div>
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-orange-50 rounded-2xl">
                      <p className="text-[10px] font-black text-orange-600 uppercase italic">Ubicación GPS</p>
                      <p className="font-mono text-[12px]">{userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-[10px] font-black text-gray-500 uppercase italic">Locales en Radio</p>
                      <p className="font-black text-xl italic">{businesses.length} ALIADOS</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'registro' && (
              <div className="max-w-3xl mx-auto">
                <div className="bg-white p-8 md:p-14 rounded-[50px] shadow-2xl border border-gray-100">
                  <h2 className="text-3xl font-black mb-10 text-black italic uppercase leading-none">Registrar Local</h2>
                  {saveStatus && <div className="mb-8 p-4 bg-orange-600 text-white rounded-2xl font-black text-center text-[12px] uppercase italic animate-pulse">{saveStatus}</div>}
                  <form onSubmit={handleSaveBusiness} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre del Negocio</span>
                        <input name="nombre" placeholder="Nombre" value={bizFormData.nombre} onChange={(e) => setBizFormData(p => ({...p, nombre: e.target.value}))} className="form-input" required/>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Categoría</span>
                        <select value={bizFormData.categoria} onChange={(e) => setBizFormData(p => ({...p, categoria: e.target.value as BusinessCategory}))} className="form-input">
                          {['Hamburguesas', 'Perros Calientes', 'Pizzas', 'Arepas', 'Tacos', 'Postres', 'Otros'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">WhatsApp</span>
                        <input name="telefono" placeholder="5512345678" value={bizFormData.telefono} onChange={(e) => setBizFormData(p => ({...p, telefono: e.target.value}))} className="form-input" />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Imagen Menú</span>
                        <input name="imagenMenu" placeholder="https://..." value={bizFormData.imagenMenu} onChange={(e) => setBizFormData(p => ({...p, imagenMenu: e.target.value}))} className="form-input" />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Descripción</span>
                      <textarea placeholder="..." value={bizFormData.descripcion} onChange={(e) => setBizFormData(p => ({...p, descripcion: e.target.value}))} className="form-input h-24 resize-none" required/>
                    </label>
                    <button type="submit" className="w-full bg-black text-white py-5 rounded-[25px] font-black uppercase italic shadow-2xl hover:bg-orange-600 transition-all">REGISTRAR 🚀</button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'cupones' && (
              <div className="space-y-10">
                {selectedBusinessId === null ? (
                  <div className="animate-fadeIn">
                    <div className="bg-black p-10 md:p-16 rounded-[60px] shadow-2xl border-b-[15px] border-orange-600 flex flex-col md:flex-row justify-between items-center gap-8">
                      <div className="text-center md:text-left">
                        <h2 className="text-5xl font-black text-orange-500 italic uppercase leading-none">LA CALLE</h2>
                        <p className="text-[10px] text-white/50 font-black mt-2 tracking-widest">DESCUBRE LO MEJOR DE IZCALLI</p>
                      </div>
                      <div className="relative w-full max-w-md">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
                        <input placeholder="Busca tu comida..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-[#F0F0F0] rounded-full font-black text-lg outline-none shadow-inner"/>
                      </div>
                    </div>

                    {sortedBusinesses.length === 0 ? (
                      <div className="text-center py-24 opacity-40 font-black uppercase italic tracking-widest text-xl">Sin resultados reales todavía...</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
                        {sortedBusinesses.map(b => {
                          const dist = calculateDistance(userLocation.lat, userLocation.lng, b.coordenadas.lat, b.coordenadas.lng);
                          const open = isBusinessOpen(b.hora_apertura, b.hora_cierre);
                          return (
                            <div key={b.id} className="group bg-white rounded-[40px] shadow-xl border border-gray-100 overflow-hidden hover:-translate-y-2 transition-all duration-300 flex flex-col">
                              <div className="h-44 bg-gray-200 relative overflow-hidden cursor-pointer" onClick={() => setSelectedBusinessId(b.id)}>
                                <img src={b.imagenMenu || 'https://picsum.photos/seed/'+b.id+'/400/600'} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={b.nombre}/>
                                <div className="absolute top-4 left-4 bg-black text-orange-500 text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic">{b.categoria}</div>
                                <div className={`absolute top-4 right-4 text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic ${open ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                  {open ? 'ABIERTO' : 'CERRADO'}
                                </div>
                                <div className="absolute bottom-4 right-4 bg-orange-600 text-white text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic">
                                  {isGPSEnabled ? `A ${(dist * 1000).toFixed(0)}m` : 'IZCALLI'}
                                </div>
                              </div>
                              <div className="p-6 flex-1 flex flex-col justify-between">
                                <div className="mb-4 cursor-pointer" onClick={() => setSelectedBusinessId(b.id)}>
                                  <h4 className="text-xl font-black text-black italic uppercase truncate">{b.nombre}</h4>
                                  <p className="text-gray-400 text-[11px] font-bold line-clamp-2 mt-1">{b.descripcion}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {b.telefono && (
                                    <a href={`https://wa.me/${b.telefono.replace(/\+/g, '').replace(/\s/g, '')}?text=${encodeURIComponent('Hola!')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-black text-[9px] uppercase italic shadow hover:brightness-105 transition-all">WhatsApp</a>
                                  )}
                                  <button onClick={() => setMenuModalUrl(b.imagenMenu || '')} className="bg-gray-200 text-gray-800 py-3 rounded-xl font-black text-[9px] uppercase italic hover:bg-orange-100 transition-all">Ver Menú</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="animate-fadeIn space-y-8">
                    <button onClick={() => { setSelectedBusinessId(null); setActiveCoupon(null); }} className="group flex items-center gap-3 bg-white px-8 py-4 rounded-full shadow-lg border border-gray-100 font-black text-[11px] uppercase italic text-black hover:bg-black hover:text-white transition-all">⬅ VOLVER</button>
                    <div className="bg-white rounded-[50px] shadow-2xl overflow-hidden flex flex-col lg:flex-row">
                      <div className="lg:w-1/2 h-[300px] lg:h-auto bg-gray-200 relative">
                        <img src={selectedBusiness?.imagenMenu || 'https://picsum.photos/seed/'+selectedBusiness?.id+'/800/600'} className="w-full h-full object-cover" alt={selectedBusiness?.nombre}/>
                        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent flex flex-col justify-end p-10 text-white">
                          <h2 className="text-4xl font-black italic uppercase">{selectedBusiness?.nombre}</h2>
                        </div>
                      </div>
                      <div className="lg:w-1/2 p-10 flex flex-col justify-center space-y-8 bg-white">
                        <div className="space-y-4">
                          <h3 className="text-xs font-black text-orange-600 uppercase tracking-widest italic">Ofertas Activas</h3>
                          {businessCoupons.length === 0 ? <p className="text-gray-400 italic text-sm">Sin promociones por hoy.</p> : businessCoupons.map(c => (
                            <div key={c.id} className="bg-black text-white p-6 rounded-[30px] flex items-center justify-between gap-4 shadow-xl">
                              <div>
                                <span className="text-[8px] font-black text-orange-500 uppercase">PROMO</span>
                                <h4 className="text-lg font-black italic uppercase leading-none mt-1">{c.descripcionDescuento}</h4>
                              </div>
                              {!activeCoupon || activeCoupon.id !== c.id ? (
                                <button onClick={() => setActiveCoupon(c)} className="bg-orange-600 text-white font-black px-6 py-3 rounded-2xl text-[10px] uppercase transition-all">OBTENER</button>
                              ) : (
                                <div className="bg-white p-2 rounded-xl animate-fadeIn"><QRCodeSVG value={`${c.idNegocio}-${c.id}`} size={60} /></div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-3">
                          {selectedBusiness?.telefono && (
                            <a href={`https://wa.me/${selectedBusiness.telefono.replace(/\+/g, '').replace(/\s/g, '')}`} target="_blank" className="bg-[#25D366] text-white py-4 rounded-2xl text-center font-black uppercase italic text-[11px] shadow-xl">Pedir por WhatsApp</a>
                          )}
                          <button onClick={() => setMenuModalUrl(selectedBusiness?.imagenMenu || '')} className="bg-black text-white py-4 rounded-2xl font-black uppercase italic text-[11px]">Ver Menú Completo</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'schema' && (
              <div className="max-w-4xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl border border-gray-100">
                <h2 className="text-2xl font-black italic uppercase mb-8">Estructura de Datos (Supabase)</h2>
                <pre className="bg-gray-900 text-green-400 p-8 rounded-3xl overflow-auto font-mono text-[12px]">
{`TABLA: negocios
- id (uuid, primary key)
- nombre (text)
- descripcion (text)
- lat (float8)
- lng (float8)
- imagen_menu (text)
- categoria (text)
- telefono (text)
- hora_apertura (time)
- hora_cierre (time)

TABLA: cupones
- id (uuid, primary key)
- id_negocio (uuid, fk)
- descripcion_descuento (text)
- codigo_qr (text)
- fecha_expiracion (timestamptz)`}
                </pre>
              </div>
            )}

            {activeTab === 'admin_cupones' && (
               <div className="max-w-3xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl text-center space-y-6">
                  <span className="text-6xl">📊</span>
                  <h2 className="text-2xl font-black italic uppercase">Métricas Reales</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-orange-50 rounded-3xl"><h5 className="font-black text-2xl">{coupons.length}</h5><p className="text-[9px] font-bold uppercase text-orange-600">Cupones</p></div>
                    <div className="p-6 bg-gray-50 rounded-3xl"><h5 className="font-black text-2xl">{businesses.length}</h5><p className="text-[9px] font-bold uppercase text-gray-400">Aliados</p></div>
                  </div>
               </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-black text-white p-12 text-center border-t-[10px] border-orange-600 mt-10">
        <div className="text-[12px] font-black uppercase tracking-[0.4em] text-orange-500 italic">📍 LA CALLE DEL HAMBRE - GPS REAL ENGINE</div>
        <p className="text-[9px] text-white/20 mt-4 font-black uppercase tracking-widest italic">Vercel 2.8 - OpenStreetMap Integration</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .form-input { 
          background-color: #F0F0F0 !important; padding: 14px 18px !important; border: 2px solid transparent !important; width: 100%; border-radius: 15px; font-weight: 700; outline: none; transition: all 0.2s; font-size: 14px;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; }
        .nav-scroll-container {
          display: flex !important; flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; gap: 10px; padding: 5px 15px; scrollbar-width: none; width: 100%;
        }
        .nav-tab-button {
          flex-shrink: 0; padding: 18px 20px; text-transform: uppercase; font-weight: 900; font-size: 10px; color: #9ca3af; border-bottom: 3px solid transparent; transition: all 0.3s ease; white-space: nowrap;
        }
        .nav-tab-button.active { color: #ea580c !important; border-bottom-color: #ea580c !important; }
        .leaflet-popup-content-wrapper { border-radius: 20px !important; padding: 10px !important; }
        .leaflet-popup-tip-container { display: none; }
      `}} />
    </div>
  );
};

export default App;
