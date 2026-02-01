
export interface GeoPoint {
  lat: number;
  lng: number;
}

export type BusinessCategory = 'Hamburguesas' | 'Perros Calientes' | 'Pizzas' | 'Arepas' | 'Tacos' | 'Postres' | 'Otros';
export type UserRole = 'CLIENTE' | 'PATROCINADOR' | 'ADMIN';

export interface Business {
  id: string;
  nombre: string;
  descripcion: string;
  coordenadas: GeoPoint;
  imagenMenu: string;
  categoria: BusinessCategory;
  telefono?: string;
  hora_apertura?: string; // Formato HH:mm
  hora_cierre?: string;   // Formato HH:mm
  owner_id?: string;      // ID del usuario dueño (Patrocinador)
}

export interface Coupon {
  id: string;
  idNegocio: string;
  descripcionDescuento: string;
  codigoQR: string; 
  fechaExpiracion: string; 
}

export interface Promotion {
  id: string;
  id_negocio: string;
  radio_km: number;
  mensaje: string;
  frecuencia_horas: number;
  imagen_url?: string;
  activa: boolean;
}

export interface User {
  id: string;
  role: UserRole;
  historialCupones: string[];
  ultimaUbicacion: GeoPoint;
  negocioId?: string; // Si es Patrocinador
}

export interface FirestoreSchema {
  negocios: Business[];
  cupones: Coupon[];
  usuarios: User[];
  promociones: Promotion[];
  perfiles: { id: string, role: UserRole, negocio_id?: string }[];
}
