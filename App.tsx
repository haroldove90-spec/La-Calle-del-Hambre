
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { QRCodeSVG } from 'https://esm.sh/qrcode.react';
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
  const [isGPSEnabled, setIsGPSEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  
  // Estado para la vista de detalle
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);

  // Formulario Registro Negocio
  const [bizFormData, setBizFormData] = useState<Partial<Business>>({
    nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: { lat: 19.6366, lng: -99.2155 }, imagenMenu: ''
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

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

  const activateRadar = () => {
    if (!navigator.geolocation) {
      setSaveStatus("Tu navegador no soporta GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setIsGPSEnabled(true);
        setSaveStatus("¡Radar Activado! Mostrando locales cerca de ti.");
        setTimeout(() => setSaveStatus(null), 3000);
      },
      (error) => {
        setSaveStatus("Error de GPS: Permiso denegado.");
        console.error(error);
      }
    );
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Procesando registro...");
    
    let publicImageUrl = bizFormData.imagenMenu || 'https://picsum.photos/400/600';

    if (imageFile) {
      setSaveStatus("Subiendo imagen al storage...");
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `menus/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('menus')
        .upload(filePath, imageFile);

      if (uploadError) {
        setSaveStatus("Error subiendo imagen: " + uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('menus')
        .getPublicUrl(filePath);
      
      publicImageUrl = publicUrlData.publicUrl;
    }

    const payload = {
      nombre: bizFormData.nombre,
      descripcion: bizFormData.descripcion,
      lat: bizFormData.coordenadas?.lat,
      lng: bizFormData.coordenadas?.lng,
      categoria: bizFormData.categoria,
      imagen_menu: publicImageUrl
    };

    const { error } = await supabase.from('negocios').insert([payload]);

    if (error) {
      setSaveStatus("Error DB: " + error.message);
    } else {
      setSaveStatus("¡Negocio registrado y menú publicado!");
      setBizFormData({ 
        nombre: '', 
        descripcion: '', 
        categoria: 'Hamburguesas', 
        coordenadas: { lat: 19.6366, lng: -99.2155 }, 
        imagenMenu: '' 
      });
      setImageFile(null);
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
      return `¡Estás cerca! ${biz?.nombre} tiene una promo para ti.`;
    }
    return '';
  }, [nearbyCoupons, businesses]);

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

  const selectedBusiness = useMemo(() => 
    businesses.find(b => b.id === selectedBusinessId), 
  [selectedBusinessId, businesses]);

  const businessCoupons = useMemo(() => 
    coupons.filter(c => c.idNegocio === selectedBusinessId),
  [selectedBusinessId, coupons]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative overflow-x-hidden">
      
      {nearbyMessage && (
        <div className="fixed top-4 md:top-24 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-sm animate-bounceIn">
          <div className="bg-white border-l-4 border-orange-500 rounded-2xl shadow-2xl p-5 flex items-start gap-4 ring-1 ring-black/10">
            <div className="bg-orange-100 p-2.5 rounded-full text-orange-600 text-2xl flex-shrink-0">📍</div>
            <div className="flex-1">
              <h4 className="font-black text-gray-900 text-[13px] italic uppercase tracking-tight">{nearbyMessage}</h4>
              <button onClick={() => { setActiveTab('cupones'); setSelectedBusinessId(nearbyCoupons[0].idNegocio); }} className="mt-3 text-[10px] font-black text-white bg-black px-5 py-2.5 rounded-full hover:bg-orange-600 transition-all uppercase">Ir al Local</button>
            </div>
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
              onClick={() => { setActiveTab(tab.id as any); setSelectedBusinessId(null); setActiveCoupon(null); }}
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
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Subir Menú (Imagen)</span>
                      <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="form-input !py-3"/>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Descripción Corta</span>
                      <textarea placeholder="Ej: Las mejores arepas rellenas..." value={bizFormData.descripcion} onChange={(e) => setBizFormData(p => ({...p, descripcion: e.target.value}))} className="form-input h-32 resize-none" required/>
                    </label>
                    <button type="submit" className="w-full bg-black text-white py-6 rounded-[30px] font-black uppercase italic text-xl shadow-2xl hover:bg-orange-600 transition-all transform active:scale-95">
                      GUARDAR NEGOCIO 🚀
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'cupones' && (
              <div className="space-y-10">
                {selectedBusinessId === null ? (
                  <div className="animate-fadeIn">
                    <div className="bg-black p-12 md:p-20 rounded-[60px] shadow-2xl border-b-[15px] border-orange-600 flex flex-col md:flex-row justify-between items-center gap-10">
                      <div className="text-center md:text-left">
                        <h2 className="text-5xl font-black text-orange-500 italic uppercase tracking-tighter leading-none">La Calle</h2>
                        <button 
                          onClick={activateRadar}
                          className="mt-6 bg-white text-black font-black px-8 py-3 rounded-full uppercase italic text-[12px] hover:bg-orange-500 hover:text-white transition-all shadow-xl flex items-center gap-2 mx-auto md:mx-0"
                        >
                          📡 Activar Radar de Hambre
                        </button>
                      </div>
                      <div className="relative w-full max-w-md">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl pointer-events-none opacity-50">🔍</span>
                        <input 
                          placeholder="Busca local o comida..." 
                          value={searchTerm} 
                          onChange={(e) => setSearchTerm(e.target.value)} 
                          className="w-full pl-16 pr-8 py-5 bg-[#F0F0F0] rounded-full font-black text-lg outline-none shadow-inner"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
                      {sortedBusinesses.map(b => {
                        const dist = calculateDistance(userLocation.lat, userLocation.lng, b.coordenadas.lat, b.coordenadas.lng);
                        return (
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
                              <div className="absolute bottom-4 right-4 bg-orange-600 text-white text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic shadow-lg">
                                {isGPSEnabled ? `A ${(dist * 1000).toFixed(0)}m de ti` : 'Izcalli Center'}
                              </div>
                            </div>
                            <div className="p-8 flex-1 flex flex-col justify-between">
                              <h4 className="text-2xl font-black text-black italic uppercase leading-tight mb-2 truncate">{b.nombre}</h4>
                              <p className="text-gray-400 text-xs font-bold line-clamp-2">{b.descripcion}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="animate-fadeIn space-y-8">
                    <button onClick={() => { setSelectedBusinessId(null); setActiveCoupon(null); }} className="group flex items-center gap-3 bg-white px-8 py-4 rounded-full shadow-lg border border-gray-100 font-black text-[11px] uppercase italic text-black hover:bg-black hover:text-white transition-all">
                      ⬅ VOLVER AL LISTADO
                    </button>

                    <div className="bg-white rounded-[60px] shadow-2xl border border-gray-50 overflow-hidden flex flex-col lg:flex-row">
                      <div className="lg:w-1/2 h-[350px] lg:h-auto bg-gray-200 relative">
                        <img src={selectedBusiness?.imagenMenu} className="w-full h-full object-cover" alt={selectedBusiness?.nombre}/>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-12 text-white">
                          <h2 className="text-5xl font-black italic uppercase leading-none mb-4">{selectedBusiness?.nombre}</h2>
                          <p className="text-white/60 font-bold text-sm max-w-md">{selectedBusiness?.descripcion}</p>
                        </div>
                      </div>
                      
                      <div className="lg:w-1/2 p-10 md:p-16 flex flex-col justify-center space-y-12 bg-white">
                        <div className="space-y-6">
                          <h3 className="text-xs font-black text-orange-600 uppercase tracking-[0.4em] italic mb-8">Ofertas Disponibles</h3>
                          <div className="space-y-6">
                            {businessCoupons.map(c => (
                              <div key={c.id} className="bg-black text-white p-8 rounded-[40px] flex flex-col items-center gap-6 shadow-2xl relative overflow-hidden group">
                                <div className="text-center w-full flex flex-col sm:flex-row justify-between items-center gap-4">
                                  <div className="text-center sm:text-left">
                                    <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest block mb-2">Promo Activa</span>
                                    <h4 className="text-2xl font-black italic uppercase leading-none">{c.descripcionDescuento}</h4>
                                  </div>
                                  {!activeCoupon || activeCoupon.id !== c.id ? (
                                    <button 
                                      onClick={() => setActiveCoupon(c)}
                                      className="bg-orange-600 text-white font-black px-8 py-4 rounded-[25px] text-[11px] uppercase shadow-xl hover:bg-white hover:text-orange-600 transition-all"
                                    >
                                      OBTENER CUPÓN
                                    </button>
                                  ) : (
                                    <div className="bg-white p-4 rounded-3xl animate-fadeIn">
                                      <QRCodeSVG value={`${c.idNegocio}-${c.id}-${new Date().getTime()}`} size={120} />
                                    </div>
                                  )}
                                </div>
                                {activeCoupon?.id === c.id && (
                                  <div className="w-full text-center border-t border-white/10 pt-4 space-y-2">
                                    <p className="text-[10px] font-black uppercase text-orange-500 italic">Muestra este código en caja para aplicar tu descuento</p>
                                    <p className="text-[8px] text-white/30 font-mono">CODE: {c.codigoQR}-{new Date().getFullYear()}</p>
                                  </div>
                                )}
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

            {/* OTRAS PESTAÑAS */}
            {activeTab === 'geofencing' && (
              <div className="max-w-4xl mx-auto bg-white p-10 rounded-[50px] shadow-2xl border border-gray-100 text-center">
                 <h2 className="text-3xl font-black italic uppercase mb-8">Mapa de Antojos</h2>
                 <p className="text-gray-400 font-bold uppercase mb-12">Simulación de Geofencing en Izcalli</p>
                 <div className="p-12 bg-gray-50 rounded-[40px] border-4 border-dashed border-gray-200">
                    <span className="text-5xl opacity-30">📍</span>
                    <p className="mt-6 text-gray-400 font-black italic uppercase text-xs">Ubicación Actual: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>
                 </div>
              </div>
            )}

            {activeTab === 'admin_cupones' && (
               <div className="max-w-3xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl text-center space-y-8">
                  <span className="text-7xl">📊</span>
                  <h2 className="text-3xl font-black italic uppercase">Panel de Control</h2>
                  <p className="text-gray-400 font-bold uppercase">Gestión de impacto y conversiones reales</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-orange-50 rounded-3xl"><h5 className="font-black text-2xl">{coupons.length}</h5><p className="text-[9px] font-bold uppercase text-orange-600">Cupones Activos</p></div>
                    <div className="p-6 bg-gray-50 rounded-3xl"><h5 className="font-black text-2xl">{businesses.length}</h5><p className="text-[9px] font-bold uppercase text-gray-400">Locales Aliados</p></div>
                  </div>
               </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-black text-white p-16 md:p-24 text-center border-t-[12px] border-orange-600">
        <div className="text-[14px] md:text-[18px] font-black uppercase tracking-[0.5em] text-orange-500 italic">
           📍 La Calle del Hambre - Izcalli Engine
        </div>
        <p className="text-[10px] text-white/20 mt-8 font-black uppercase tracking-widest italic">Vercel Deployment v2.5 - Supabase Cloud Storage</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounceIn { 0% { opacity: 0; transform: translate(-50%, -40px) scale(0.9); } 70% { opacity: 1; transform: translate(-50%, 5px) scale(1.03); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }
        .animate-bounceIn { animation: bounceIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        
        .form-input { 
          background-color: #F0F0F0 !important; 
          padding: 16px 20px !important; 
          border: 2px solid transparent !important; 
          width: 100%;
          border-radius: 20px;
          font-weight: 700;
          outline: none;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; }

        .nav-scroll-container {
          display: flex !important;
          flex-wrap: nowrap !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          gap: 15px;
          padding: 5px 15px;
          scrollbar-width: none;
        }
        .nav-tab-button {
          flex-shrink: 0; padding: 20px 25px; text-transform: uppercase; font-weight: 900; font-size: 11px; color: #9ca3af; border-bottom: 4px solid transparent; transition: all 0.3s ease; white-space: nowrap;
        }
        .nav-tab-button.active { color: #ea580c !important; border-bottom-color: #ea580c !important; }
      `}} />
    </div>
  );
};

export default App;
