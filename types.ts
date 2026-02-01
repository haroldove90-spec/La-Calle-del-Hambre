
export interface GeoPoint {
  lat: number;
  lng: number;
}

export type BusinessCategory = 'Hamburguesas' | 'Perros Calientes' | 'Pizzas' | 'Arepas' | 'Tacos' | 'Postres' | 'Otros';

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
}

export interface Coupon {
  id: string;
  idNegocio: string;
  descripcionDescuento: string;
  codigoQR: string; 
  fechaExpiracion: string; 
}

export interface User {
  id: string;
  historialCupones: string[];
  ultimaUbicacion: GeoPoint;
}

export interface FirestoreSchema {
  negocios: Business[];
  cupones: Coupon[];
  usuarios: User[];
}
