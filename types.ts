
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
  telefono?: string; // Nuevo campo para WhatsApp
}

export interface Coupon {
  id: string;
  idNegocio: string;
  descripcionDescuento: string;
  codigoQR: string; // URL o String codificado
  fechaExpiracion: string; // ISO String
}

export interface User {
  id: string;
  historialCupones: string[]; // Array de IDs de cupones canjeados
  ultimaUbicacion: GeoPoint;
}

export interface FirestoreSchema {
  negocios: Business[];
  cupones: Coupon[];
  usuarios: User[];
}