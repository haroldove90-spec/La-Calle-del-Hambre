
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { Business, GeoPoint, BusinessCategory, Coupon } from './types';

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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'schema' | 'geofencing' | 'registro' | 'cupones' | 'admin_cupones'>('cupones');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [userLocation, setUserLocation] = useState<GeoPoint>({ lat: 19.6468, lng: -99.2255 });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  
  // Estado para la vista de detalle
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  // Formulario Registro Negocio
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({
    nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: { lat: 19.6366, lng: -99.2155 }, imagenMenu: ''
  });

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const { data: bData, error: bError } = await supabase.from('negocios').select('*');
      const { data: cData, error: cError } = await supabase.from('cupones').select('*');
      
      if (bError) console.error("Error negocios:", bError);
      if (cError) console.error("Error cupones:", cError);

      setBusinesses((bData || []).map(b => ({
        id: b.id, 
        nombre: b.nombre, 
        descripcion: b.descripcion, 
        coordenadas: { lat: b.lat, lng: b.lng }, 
        imagenMenu: b.imagen_menu || 'https://picsum.photos/400/600', 
        categoria: b.categoria as BusinessCategory
      })));
      setCoupons((cData || []).map(c => ({
        id: c.id, 
        idNegocio: c.id_negocio, 
        descripcionDescuento: c.descripcion_descuento, 
        codigoQR: c.codigo_qr, 
        fechaExpiracion: c.fecha_expiracion
      })));
    } catch (e) {
      console.error("Fetch error:", e);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAllData(); }, []);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Guardando en Supabase...");
    
    const payload = {
      nombre: bizFormData.nombre,
      descripcion: bizFormData.descripcion,
      lat: bizFormData.coordenadas?.lat,
      lng: bizFormData.coordenadas?.lng,
      categoria: bizFormData.categoria,
      imagen_menu: bizFormData.imagenMenu || 'https://picsum.photos/400/600'
    };

    const { error } = await supabase.from('negocios').insert([payload]);

    if (error) {
      setSaveStatus("Error: " + error.message);
    } else {
      setSaveStatus("¡Negocio registrado con éxito!");
      setBizFormData({ 
        nombre: '', 
        descripcion: '', 
        categoria: 'Hamburguesas', 
        coordenadas: { lat: 19.6366, lng: -99.2155 }, 
        imagenMenu: '' 
      });
      await fetchAllData();
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const nearbyCoupons = useMemo(() => {
    return coupons.filter(coupon => {
      const biz = businesses.find(b => b.id === coupon.idNegocio);
      return biz && calculateDistance(userLocation.lat, userLocation.lng, biz.coordenadas.lat, biz.coordenadas.lng) <= 2;
    });
  }, [userLocation, coupons, businesses]);

  const nearbyMessage = useMemo(() => {
    if (nearbyCoupons.length > 0) {
      const biz = businesses.find(b => b.id === nearbyCoupons[0].idNegocio);
      if (biz?.nombre.includes('Tapatío')) return '¡Estás en la Calle del Hambre! Pasa por tus tacos al Tapatío';
      return `¡Estás cerca! ${biz?.nombre} tiene una promo para ti.`;
    }
    return '';
  }, [nearbyCoupons, businesses]);

  const filteredBusinesses = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return businesses.filter(b => 
      b.nombre.toLowerCase().includes(lowerSearch) || 
      b.categoria.toLowerCase().includes(lowerSearch)
    );
  }, [businesses, searchTerm]);

  const selectedBusiness = useMemo(() => 
    businesses.find(b => b.id === selectedBusinessId), 
  [selectedBusinessId, businesses]);

  const businessCoupons = useMemo(() => 
    coupons.filter(c => c.idNegocio === selectedBusinessId),
  [selectedBusinessId, coupons]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative overflow-x-hidden">
      
      {/* NOTIFICACIÓN GEOFENCING */}
      {nearbyMessage && (
        <div className="fixed top-4 md:top-24 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-sm animate-bounceIn">
          <div className="bg-white border-l-4 border-orange-500 rounded-2xl shadow-2xl p-5 flex items-start gap-4 ring-1 ring-black/10">
            <div className="bg-orange-100 p-2.5 rounded-full text-orange-600 text-2xl flex-shrink-0">🌮</div>
            <div className="flex-1">
              <h4 className="font-black text-gray-900 text-[13px] italic uppercase tracking-tight">{nearbyMessage}</h4>
              <button onClick={() => { setActiveTab('cupones'); setSelectedBusinessId(nearbyCoupons[0].idNegocio); }} className="mt-3 text-[10px] font-black text-white bg-black px-5 py-2.5 rounded-full hover:bg-orange-600 transition-all uppercase">Ir al Local</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between border-b-4 border-orange-600 gap-4">
        <div className="flex items-center gap-4">
          <span className="text-4xl">🍔</span>
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-black uppercase italic text-orange-500 leading-none">Calle del Hambre <span className="text-white">App</span></h1>
            <p className="text-[10px] font-bold opacity-70 tracking-[0.2em] uppercase mt-1">Directorio Real-Time</p>
          </div>
        </div>
        <div className="bg-orange-600 px-5 py-2 rounded-full text-[10px] font-black italic shadow-lg uppercase animate-pulse tracking-widest">📍 IZCALLI CORE</div>
      </header>

      {/* NAVEGACIÓN DESLIZABLE - SOLUCIÓN DEFINITIVA */}
      <nav className="bg-white border-b sticky top-0 z-[80] shadow-md w-full">
        <div className="nav-scroll-container">
          {[
            { id: 'schema', label: 'Estructura Datos' },
            { id: 'geofencing', label: 'Simulador GPS' },
            { id: 'registro', label: 'Nuevo Punto' },
            { id: 'cupones', label: 'Cupones y Antojos' },
            { id: 'admin_cupones', label: 'Mis Promos' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setSelectedBusinessId(null); }}
              className={`nav-tab-button ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-7xl">
        {loading && <div className="text-center py-20 font-black text-orange-600 animate-pulse italic uppercase tracking-[0.3em]">Cargando desde Supabase...</div>}
        
        {!loading && (
          <div className="animate-fadeIn">
            {activeTab === 'schema' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h2 className="font-black text-gray-800 italic uppercase">Estado de la Nube</h2>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Sincronizado con PostgREST</p>
                  </div>
                  <button onClick={fetchAllData} className="w-full md:w-auto bg-black text-white px-8 py-4 rounded-2xl font-black text-[12px] uppercase shadow-xl hover:bg-orange-600 transition-all">REFRESCAR AHORA 🔄</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-gray-900 p-6 rounded-[35px] shadow-2xl overflow-hidden border-2 border-black">
                    <span className="text-xs font-black text-orange-500 uppercase italic mb-4 block">Tabla: negocios</span>
                    <pre className="text-green-400 text-[10px] font-mono h-[300px] overflow-auto no-scrollbar">{JSON.stringify(businesses, null, 2)}</pre>
                  </div>
                  <div className="bg-gray-900 p-6 rounded-[35px] shadow-2xl overflow-hidden border-2 border-black">
                    <span className="text-xs font-black text-blue-500 uppercase italic mb-4 block">Tabla: cupones</span>
                    <pre className="text-blue-300 text-[10px] font-mono h-[300px] overflow-auto no-scrollbar">{JSON.stringify(coupons, null, 2)}</pre>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'registro' && (
              <div className="max-w-3xl mx-auto">
                <div className="bg-white p-8 md:p-14 rounded-[50px] shadow-2xl border border-gray-100">
                  <h2 className="text-3xl font-black mb-10 text-black italic uppercase leading-none">Registrar Local</h2>
                  {saveStatus && <div className="mb-8 p-4 bg-orange-600 text-white rounded-2xl font-black text-center text-[12px] uppercase italic animate-pulse shadow-lg">{saveStatus}</div>}
                  <form onSubmit={handleSaveBusiness} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre del Negocio</span>
                        <input name="nombre" placeholder="Ej: Burger King Izcalli" value={bizFormData.nombre} onChange={(e) => setBizFormData(p => ({...p, nombre: e.target.value}))} className="form-input" required/>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Categoría</span>
                        <select value={bizFormData.categoria} onChange={(e) => setBizFormData(p => ({...p, categoria: e.target.value as BusinessCategory}))} className="form-input">
                          {['Hamburguesas', 'Perros Calientes', 'Pizzas', 'Arepas', 'Tacos', 'Postres', 'Otros'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Descripción Corta</span>
                      <textarea placeholder="Ej: Las mejores arepas rellenas de la zona..." value={bizFormData.descripcion} onChange={(e) => setBizFormData(p => ({...p, descripcion: e.target.value}))} className="form-input h-32 resize-none" required/>
                    </label>
                    <div className="grid grid-cols-2 gap-6 p-6 bg-gray-50 rounded-[30px] border-2 border-dashed border-gray-200">
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Latitud</span>
                        <input type="number" step="0.000001" value={bizFormData.coordenadas?.lat} onChange={(e) => setBizFormData(p => ({...p, coordenadas: {...p.coordenadas!, lat: parseFloat(e.target.value)}}))} className="form-input !bg-white"/>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Longitud</span>
                        <input type="number" step="0.000001" value={bizFormData.coordenadas?.lng} onChange={(e) => setBizFormData(p => ({...p, coordenadas: {...p.coordenadas!, lng: parseFloat(e.target.value)}}))} className="form-input !bg-white"/>
                      </label>
                    </div>
                    <button type="submit" className="w-full bg-black text-white py-6 rounded-[30px] font-black uppercase italic text-xl shadow-2xl hover:bg-orange-600 transition-all transform active:scale-95 tracking-tighter">
                      GUARDAR NEGOCIO 🚀
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'cupones' && (
              <div className="space-y-10">
                {selectedBusinessId === null ? (
                  /* VISTA 1: DIRECTORIO DE NEGOCIOS */
                  <div className="animate-fadeIn">
                    <div className="bg-black p-12 md:p-20 rounded-[60px] shadow-2xl border-b-[15px] border-orange-600 flex flex-col md:flex-row justify-between items-center gap-10">
                      <div className="text-center md:text-left">
                        <h2 className="text-5xl font-black text-orange-500 italic uppercase tracking-tighter leading-none">La Calle</h2>
                        <p className="text-white/40 font-black uppercase text-xs tracking-[0.4em] mt-3">Directorio de Sabores en Izcalli</p>
                      </div>
                      <div className="relative w-full max-w-md">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl pointer-events-none opacity-50">🔍</span>
                        <input 
                          placeholder="Busca local o comida..." 
                          value={searchTerm} 
                          onChange={(e) => setSearchTerm(e.target.value)} 
                          className="w-full pl-16 pr-8 py-5 bg-[#F0F0F0] rounded-full font-black text-lg outline-none shadow-inner text-black placeholder:text-gray-400"
                        />
                      </div>
                    </div>

                    {businesses.length === 0 ? (
                      /* ESTADO VACÍO SOLICITADO */
                      <div className="mt-16 flex flex-col items-center justify-center p-12 bg-white border-2 border-dashed border-gray-200 rounded-[50px] shadow-inner text-center space-y-8 animate-fadeIn">
                        <span className="text-7xl grayscale opacity-20">🏪</span>
                        <div className="space-y-2">
                          <h3 className="text-2xl font-black italic uppercase text-gray-800">No hay locales registrados aún</h3>
                          <p className="text-gray-400 font-bold text-sm uppercase">Sé el pionero en la Calle del Hambre</p>
                        </div>
                        <button 
                          onClick={() => setActiveTab('registro')}
                          className="bg-orange-600 text-white font-black px-12 py-6 rounded-[30px] text-xl uppercase italic shadow-2xl hover:bg-black transition-all active:scale-95"
                        >
                          + Registrar el primer local de la Calle del Hambre
                        </button>
                      </div>
                    ) : (
                      /* LISTADO DE NEGOCIOS */
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
                        {filteredBusinesses.map(b => (
                          <div 
                            key={b.id} 
                            onClick={() => setSelectedBusinessId(b.id)}
                            className="group bg-white rounded-[40px] shadow-xl border border-gray-100 overflow-hidden cursor-pointer hover:-translate-y-3 transition-all duration-500 flex flex-col"
                          >
                            <div className="h-48 bg-gray-200 relative overflow-hidden">
                              <img src={b.imagenMenu} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={b.nombre}/>
                              <div className="absolute top-4 left-4 bg-black text-orange-500 text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic shadow-2xl">
                                {b.categoria}
                              </div>
                            </div>
                            <div className="p-8 flex-1 flex flex-col justify-between">
                              <div>
                                <h4 className="text-2xl font-black text-black italic uppercase leading-tight mb-2 truncate">{b.nombre}</h4>
                                <p className="text-gray-400 text-xs font-bold line-clamp-2 h-8">{b.descripcion}</p>
                              </div>
                              <div className="mt-6 flex justify-between items-center border-t pt-4">
                                <span className="text-[10px] font-black text-orange-600 uppercase italic">Ver Perfil ➔</span>
                                <div className="bg-orange-100 text-orange-600 font-black px-3 py-1 rounded-full text-[10px]">
                                  {coupons.filter(c => c.idNegocio === b.id).length} Promos
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* VISTA 2: PERFIL DE NEGOCIO (DETALLE) */
                  <div className="animate-fadeIn space-y-8">
                    <button 
                      onClick={() => setSelectedBusinessId(null)}
                      className="group flex items-center gap-3 bg-white px-8 py-4 rounded-full shadow-lg border border-gray-100 font-black text-[11px] uppercase italic text-black hover:bg-black hover:text-white transition-all transform active:scale-95"
                    >
                      <span className="group-hover:-translate-x-1 transition-transform">⬅</span> VOLVER AL LISTADO
                    </button>

                    <div className="bg-white rounded-[60px] shadow-2xl border border-gray-50 overflow-hidden flex flex-col lg:flex-row">
                      <div className="lg:w-1/2 h-[350px] lg:h-auto bg-gray-200 relative">
                        <img src={selectedBusiness?.imagenMenu} className="w-full h-full object-cover" alt={selectedBusiness?.nombre}/>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-12 text-white">
                          <span className="bg-orange-600 text-[11px] font-black px-6 py-2 rounded-full uppercase italic w-fit mb-4 shadow-xl">Menú Oficial</span>
                          <h2 className="text-5xl font-black italic uppercase leading-none mb-4">{selectedBusiness?.nombre}</h2>
                          <p className="text-white/60 font-bold text-sm max-w-md">{selectedBusiness?.descripcion}</p>
                        </div>
                      </div>
                      
                      <div className="lg:w-1/2 p-10 md:p-16 flex flex-col justify-center space-y-12 bg-white">
                        <div className="space-y-6">
                          <h3 className="text-xs font-black text-orange-600 uppercase tracking-[0.4em] italic mb-8">Ofertas Activas</h3>
                          <div className="space-y-6">
                            {businessCoupons.length === 0 && (
                              <div className="p-8 bg-gray-50 rounded-[30px] border-2 border-dashed border-gray-200 text-center">
                                <p className="text-gray-400 font-bold italic uppercase text-[10px]">Sin promociones activas por ahora</p>
                              </div>
                            )}
                            {businessCoupons.map(c => (
                              <div key={c.id} className="bg-black text-white p-8 rounded-[40px] flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 text-white/5 text-8xl font-black italic select-none">HOT</div>
                                <div className="relative z-10 text-center sm:text-left">
                                  <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest block mb-2">Vence: {new Date(c.fechaExpiracion).toLocaleDateString()}</span>
                                  <h4 className="text-2xl font-black italic uppercase leading-none">{c.descripcionDescuento}</h4>
                                </div>
                                <button className="relative z-10 bg-orange-600 text-white font-black px-10 py-5 rounded-[25px] text-[12px] uppercase shadow-xl hover:bg-white hover:text-orange-600 transition-all active:scale-95">CANJEAR</button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="pt-10 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                          <div className="text-center sm:text-left">
                            <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Localizado en</span>
                            <span className="text-sm font-black text-gray-800 uppercase italic">Izcalli, Cumbria</span>
                          </div>
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedBusiness?.coordenadas.lat},${selectedBusiness?.coordenadas.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto bg-black text-white py-5 px-10 rounded-[30px] font-black uppercase italic text-[12px] shadow-xl text-center hover:bg-orange-600 transition-all flex items-center justify-center gap-3 tracking-tighter"
                          >
                            📍 CÓMO LLEGAR AL LOCAL
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* OTRAS PESTAÑAS SIMULADAS */}
            {activeTab === 'geofencing' && (
              <div className="max-w-4xl mx-auto bg-white p-10 rounded-[50px] shadow-2xl border border-gray-100 space-y-10">
                <h2 className="text-3xl font-black italic uppercase text-black">Simulador GPS Cumbria</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="bg-[#F0F0F0] p-8 rounded-[40px] space-y-6 shadow-inner">
                    <label className="block">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Latitud</span>
                      <input type="number" step="0.0001" value={userLocation.lat} onChange={(e) => setUserLocation(p => ({...p, lat: parseFloat(e.target.value)}))} className="form-input !bg-white"/>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Longitud</span>
                      <input type="number" step="0.0001" value={userLocation.lng} onChange={(e) => setUserLocation(p => ({...p, lng: parseFloat(e.target.value)}))} className="form-input !bg-white"/>
                    </label>
                  </div>
                  <div className="space-y-4">
                    {businesses.length === 0 && <p className="text-center text-gray-400 italic">No hay locales para rastrear</p>}
                    {businesses.map(b => {
                      const d = calculateDistance(userLocation.lat, userLocation.lng, b.coordenadas.lat, b.coordenadas.lng);
                      return (
                        <div key={b.id} className={`p-6 rounded-[30px] border-2 flex justify-between items-center transition-all ${d <= 2 ? 'bg-orange-50 border-orange-500 shadow-lg' : 'bg-white border-gray-100 opacity-40'}`}>
                          <span className="font-black uppercase text-xs italic">{b.nombre}</span>
                          <span className="font-mono font-black text-orange-600">{d.toFixed(2)} km</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'admin_cupones' && (
               <div className="max-w-3xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl border border-gray-100 text-center space-y-8">
                  <span className="text-7xl">🔥</span>
                  <h2 className="text-3xl font-black italic uppercase">Mis Cupones (Admin)</h2>
                  <p className="text-gray-400 font-bold uppercase">Gestión avanzada de promociones Cloud Supabase</p>
                  <div className="p-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[30px]">
                    <p className="text-orange-600 font-black italic uppercase text-xs">Próximamente: Panel de analíticas de canje</p>
                  </div>
               </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-black text-white p-16 md:p-24 text-center border-t-[12px] border-orange-600">
        <div className="flex justify-center gap-12 text-5xl filter grayscale opacity-20 mb-12">
           <span>🍕</span><span>🍔</span><span>🌮</span><span>🌭</span><span>🍩</span>
        </div>
        <div className="text-[14px] md:text-[18px] font-black uppercase tracking-[0.5em] text-orange-500 italic leading-relaxed px-4">
           📍 La Calle del Hambre - Izcalli Engine
        </div>
        <p className="text-[10px] text-white/20 mt-8 font-black uppercase tracking-widest italic">CONNECTED CLOUD: {SUPABASE_URL}</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounceIn { 0% { opacity: 0; transform: translate(-50%, -40px) scale(0.9); } 70% { opacity: 1; transform: translate(-50%, 5px) scale(1.03); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }
        .animate-bounceIn { animation: bounceIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .form-input { 
          background-color: #F0F0F0 !important; 
          padding: 16px 20px !important; 
          border: 2px solid transparent !important; 
          width: 100%;
          border-radius: 20px;
          font-weight: 700;
          outline: none;
          transition: all 0.3s ease;
        }
        .form-input:focus { 
          border-color: #ea580c !important; 
          background-color: #fff !important; 
          box-shadow: 0 10px 30px -10px rgba(234, 88, 12, 0.2);
        }

        /* SOLUCIÓN DEFINITIVA NAVEGACIÓN SOLICITADA */
        .nav-scroll-container {
          display: flex !important;
          flex-wrap: nowrap !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          gap: 15px;
          padding-bottom: 5px;
          padding-left: 15px;
          padding-right: 15px;
          scrollbar-width: none;
        }
        .nav-scroll-container::-webkit-scrollbar {
          display: none;
        }

        .nav-tab-button {
          flex-shrink: 0;
          padding: 20px 25px;
          text-transform: uppercase;
          font-weight: 900;
          font-size: 11px;
          color: #9ca3af;
          border-bottom: 4px solid transparent;
          transition: all 0.3s ease;
          letter-spacing: 0.15em;
          white-space: nowrap;
        }
        
        .nav-tab-button.active {
          color: #ea580c !important;
          border-bottom-color: #ea580c !important;
        }
      `}} />
    </div>
  );
};

export default App;
