
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { QRCodeSVG } from 'https://esm.sh/qrcode.react';
import { Business, GeoPoint, BusinessCategory, Coupon } from './types.ts';

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

  if (closeTime < openTime) { // Caso horario nocturno (ej: 18:00 a 02:00)
    return currentTime >= openTime || currentTime <= closeTime;
  }
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
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsGPSEnabled(true);
        setSaveStatus("¡Radar Activado!");
        setTimeout(() => setSaveStatus(null), 3000);
      },
      (error) => { setSaveStatus("Error de GPS: Permiso denegado."); }
    );
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Procesando registro...");
    let publicImageUrl = bizFormData.imagenMenu || '';

    if (imageFile) {
      const fileName = `${Math.random()}.${imageFile.name.split('.').pop()}`;
      const filePath = `menus/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('menus').upload(filePath, imageFile);
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('menus').getPublicUrl(filePath);
        publicImageUrl = publicUrlData.publicUrl;
      }
    }

    const payload = {
      nombre: bizFormData.nombre,
      descripcion: bizFormData.descripcion,
      lat: bizFormData.coordenadas?.lat,
      lng: bizFormData.coordenadas?.lng,
      categoria: bizFormData.categoria,
      imagen_menu: publicImageUrl,
      telefono: bizFormData.telefono,
      hora_apertura: bizFormData.hora_apertura,
      hora_cierre: bizFormData.hora_cierre
    };

    const { error } = await supabase.from('negocios').insert([payload]);
    if (error) {
      setSaveStatus("Error: " + error.message);
    } else {
      setSaveStatus("¡Negocio registrado!");
      setBizFormData({ nombre: '', descripcion: '', categoria: 'Hamburguesas', coordenadas: { lat: 19.6366, lng: -99.2155 }, imagenMenu: '', telefono: '' });
      setImageFile(null);
      await fetchAllData();
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

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
                <p className="font-black uppercase text-black">Este local aún no ha subido su menú</p>
              </div>
            )}
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
        <div className="bg-orange-600 px-5 py-2 rounded-full text-[10px] font-black italic shadow-lg uppercase animate-pulse tracking-widest">
           {isGPSEnabled ? "📡 RADAR ON" : "📍 IZCALLI CORE"}
        </div>
      </header>

      {/* NAVEGACIÓN DESLIZABLE */}
      <nav className="bg-white border-b sticky top-0 z-[80] shadow-md w-full overflow-hidden">
        <div className="nav-scroll-container">
          {[
            { id: 'schema', label: 'ESTRUCTURA DATOS' },
            { id: 'geofencing', label: 'SIMULADOR GPS' },
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
        {loading && <div className="text-center py-20 font-black text-orange-600 animate-pulse italic uppercase tracking-[0.3em]">Cargando locales...</div>}
        
        {!loading && (
          <div className="animate-fadeIn">
            {activeTab === 'registro' && (
              <div className="max-w-3xl mx-auto">
                <div className="bg-white p-8 md:p-14 rounded-[50px] shadow-2xl border border-gray-100">
                  <h2 className="text-3xl font-black mb-10 text-black italic uppercase leading-none">Registrar Local</h2>
                  {saveStatus && <div className="mb-8 p-4 bg-orange-600 text-white rounded-2xl font-black text-center text-[12px] uppercase animate-pulse">{saveStatus}</div>}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Teléfono de pedidos (WhatsApp)</span>
                        <input name="telefono" placeholder="Ej: 5512345678" value={bizFormData.telefono} onChange={(e) => setBizFormData(p => ({...p, telefono: e.target.value}))} className="form-input" />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">URL del Menú (Imagen)</span>
                        <input name="imagenMenu" placeholder="https://..." value={bizFormData.imagenMenu} onChange={(e) => setBizFormData(p => ({...p, imagenMenu: e.target.value}))} className="form-input" />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Hora Apertura (HH:mm)</span>
                        <input type="time" value={bizFormData.hora_apertura} onChange={(e) => setBizFormData(p => ({...p, hora_apertura: e.target.value}))} className="form-input" />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Hora Cierre (HH:mm)</span>
                        <input type="time" value={bizFormData.hora_cierre} onChange={(e) => setBizFormData(p => ({...p, hora_cierre: e.target.value}))} className="form-input" />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Descripción</span>
                      <textarea placeholder="Ej: Tradición de sabor..." value={bizFormData.descripcion} onChange={(e) => setBizFormData(p => ({...p, descripcion: e.target.value}))} className="form-input h-32 resize-none" required/>
                    </label>
                    <button type="submit" className="w-full bg-black text-white py-6 rounded-[30px] font-black uppercase italic text-xl shadow-2xl hover:bg-orange-600 transition-all">
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
                        <h2 className="text-5xl font-black text-orange-500 italic uppercase tracking-tighter leading-none">LA CALLE</h2>
                        <button onClick={activateRadar} className="mt-6 bg-white text-black font-black px-8 py-3 rounded-full uppercase italic text-[12px] hover:bg-orange-500 hover:text-white transition-all shadow-xl flex items-center gap-2 mx-auto md:mx-0">📡 Activar Radar</button>
                      </div>
                      <div className="relative w-full max-w-md">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl pointer-events-none opacity-50">🔍</span>
                        <input placeholder="Buscar local..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-[#F0F0F0] rounded-full font-black text-lg outline-none shadow-inner"/>
                      </div>
                    </div>

                    {sortedBusinesses.length === 0 ? (
                      <div className="text-center py-20 opacity-30 font-black uppercase italic tracking-widest">No hay negocios registrados</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
                        {sortedBusinesses.map(b => {
                          const dist = calculateDistance(userLocation.lat, userLocation.lng, b.coordenadas.lat, b.coordenadas.lng);
                          const open = isBusinessOpen(b.hora_apertura, b.hora_cierre);
                          return (
                            <div key={b.id} className="group bg-white rounded-[40px] shadow-xl border border-gray-100 overflow-hidden hover:-translate-y-3 transition-all duration-500 flex flex-col">
                              <div className="h-48 bg-gray-200 relative overflow-hidden cursor-pointer" onClick={() => setSelectedBusinessId(b.id)}>
                                <img src={b.imagenMenu || 'https://picsum.photos/seed/'+b.id+'/400/600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={b.nombre}/>
                                <div className="absolute top-4 left-4 bg-black text-orange-500 text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic shadow-2xl">{b.categoria}</div>
                                <div className={`absolute top-4 right-4 text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic shadow-lg ${open ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                  {open ? 'ABIERTO' : 'CERRADO'}
                                </div>
                                <div className="absolute bottom-4 right-4 bg-orange-600 text-white text-[9px] font-black px-4 py-1.5 rounded-full uppercase italic shadow-lg">
                                  {isGPSEnabled ? `A ${(dist * 1000).toFixed(0)}m de ti` : 'IZCALLI CENTER'}
                                </div>
                              </div>
                              <div className="p-8 flex-1 flex flex-col justify-between">
                                <div className="mb-6 cursor-pointer" onClick={() => setSelectedBusinessId(b.id)}>
                                  <h4 className="text-2xl font-black text-black italic uppercase leading-tight mb-2 truncate">{b.nombre}</h4>
                                  <p className="text-gray-400 text-xs font-bold line-clamp-2">{b.descripcion}</p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                  {b.telefono && (
                                    <a href={`https://wa.me/${b.telefono.replace(/\+/g, '').replace(/\s/g, '')}?text=${encodeURIComponent('Hola, vi tu promoción en la app Calle del Hambre y me gustaría hacer un pedido.')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3.5 rounded-2xl font-black text-[9px] uppercase italic shadow-lg hover:brightness-110 transition-all">
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                WhatsApp
                                    </a>
                                  )}
                                  <button onClick={() => setMenuModalUrl(b.imagenMenu || '')} className="flex items-center justify-center gap-2 bg-gray-200 text-gray-800 py-3.5 rounded-2xl font-black text-[9px] uppercase italic shadow hover:bg-orange-100 hover:text-orange-600 transition-all">Ver Menú 📋</button>
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
                    <div className="bg-white rounded-[60px] shadow-2xl border border-gray-50 overflow-hidden flex flex-col lg:flex-row">
                      <div className="lg:w-1/2 h-[350px] lg:h-auto bg-gray-200 relative">
                        <img src={selectedBusiness?.imagenMenu || 'https://picsum.photos/seed/'+selectedBusiness?.id+'/800/600'} className="w-full h-full object-cover" alt={selectedBusiness?.nombre}/>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-12 text-white">
                          <h2 className="text-5xl font-black italic uppercase leading-none mb-4">{selectedBusiness?.nombre}</h2>
                          <p className="text-white/60 font-bold text-sm max-w-md">{selectedBusiness?.descripcion}</p>
                        </div>
                      </div>
                      <div className="lg:w-1/2 p-10 md:p-16 flex flex-col justify-center space-y-12 bg-white">
                        <div className="space-y-6">
                          <h3 className="text-xs font-black text-orange-600 uppercase tracking-[0.4em] italic mb-8">Ofertas Activas</h3>
                          <div className="space-y-6">
                            {businessCoupons.length === 0 ? <p className="text-gray-400 italic">No hay cupones hoy.</p> : businessCoupons.map(c => (
                              <div key={c.id} className="bg-black text-white p-8 rounded-[40px] flex flex-col items-center gap-6 shadow-2xl relative overflow-hidden group">
                                <div className="text-center w-full flex flex-col sm:flex-row justify-between items-center gap-4">
                                  <div className="text-center sm:text-left">
                                    <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest block mb-2">PROMO</span>
                                    <h4 className="text-2xl font-black italic uppercase leading-none">{c.descripcionDescuento}</h4>
                                  </div>
                                  {!activeCoupon || activeCoupon.id !== c.id ? (
                                    <button onClick={() => setActiveCoupon(c)} className="bg-orange-600 text-white font-black px-8 py-4 rounded-[25px] text-[11px] uppercase hover:bg-white hover:text-orange-600 transition-all">OBTENER</button>
                                  ) : (
                                    <div className="bg-white p-4 rounded-3xl animate-fadeIn"><QRCodeSVG value={`${c.idNegocio}-${c.id}`} size={100} /></div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-4">
                          {selectedBusiness?.telefono && (
                            <a href={`https://wa.me/${selectedBusiness.telefono.replace(/\+/g, '').replace(/\s/g, '')}?text=${encodeURIComponent('Hola, me interesa pedir algo de tu local...')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 bg-[#25D366] text-white py-5 rounded-[30px] font-black uppercase italic text-[12px] shadow-xl hover:brightness-110 transition-all w-full">Pedir por WhatsApp</a>
                          )}
                          <button onClick={() => setMenuModalUrl(selectedBusiness?.imagenMenu || '')} className="bg-black text-white py-5 rounded-[30px] font-black uppercase italic text-[12px] shadow-xl hover:bg-orange-600 transition-all w-full">Ver Menú Completo 📋</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* OTRAS PESTAÑAS (MANTENIDAS) */}
            {activeTab === 'geofencing' && <div className="max-w-4xl mx-auto bg-white p-10 rounded-[50px] shadow-2xl text-center"><h2 className="text-3xl font-black italic uppercase mb-8">Mapa de Antojos</h2><p className="text-gray-400 font-bold uppercase mb-12">Simulación de Geofencing Izcalli</p><div className="p-12 bg-gray-50 rounded-[40px] border-4 border-dashed border-gray-200"><span className="text-5xl opacity-30">📍</span><p className="mt-6 text-gray-400 font-black italic uppercase text-xs">Ubicación: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p></div></div>}
            {activeTab === 'admin_cupones' && <div className="max-w-3xl mx-auto bg-white p-12 rounded-[50px] shadow-2xl text-center space-y-8"><span className="text-7xl">📊</span><h2 className="text-3xl font-black italic uppercase">Panel de Control</h2><div className="grid grid-cols-2 gap-4"><div className="p-6 bg-orange-50 rounded-3xl"><h5 className="font-black text-2xl">{coupons.length}</h5><p className="text-[9px] font-bold uppercase text-orange-600">Cupones</p></div><div className="p-6 bg-gray-50 rounded-3xl"><h5 className="font-black text-2xl">{businesses.length}</h5><p className="text-[9px] font-bold uppercase text-gray-400">Aliados</p></div></div></div>}
          </div>
        )}
      </main>

      <footer className="bg-black text-white p-16 md:p-24 text-center border-t-[12px] border-orange-600">
        <div className="text-[14px] md:text-[18px] font-black uppercase tracking-[0.5em] text-orange-500 italic">📍 LA CALLE DEL HAMBRE - IZCALLI ENGINE</div>
        <p className="text-[10px] text-white/20 mt-8 font-black uppercase tracking-widest italic tracking-wider">Vercel Deployment v2.7 - Live API Integration</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .form-input { 
          background-color: #F0F0F0 !important; padding: 16px 20px !important; border: 2px solid transparent !important; width: 100%; border-radius: 20px; font-weight: 700; outline: none; transition: all 0.2s;
        }
        .form-input:focus { border-color: #ea580c !important; background-color: #fff !important; }
        .nav-scroll-container {
          display: flex !important; flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; gap: 15px; padding: 5px 15px; scrollbar-width: none; width: 100%;
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
