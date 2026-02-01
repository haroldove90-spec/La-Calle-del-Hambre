
import { Business, Coupon, User } from './types';

export const MOCK_BUSINESSES: Business[] = [
  {
    id: 'biz_001',
    nombre: 'El Chamo Burger',
    descripcion: 'Las mejores hamburguesas con sazón venezolano.',
    coordenadas: { lat: 10.4806, lng: -66.9036 },
    imagenMenu: 'https://picsum.photos/400/600',
    categoria: 'Hamburguesas'
  },
  {
    id: 'biz_002',
    nombre: 'Pizza Nostra',
    descripcion: 'Pizzas a la leña en el corazón de la calle.',
    coordenadas: { lat: 10.4910, lng: -66.8950 },
    imagenMenu: 'https://picsum.photos/400/600',
    categoria: 'Pizzas'
  }
];

export const MOCK_COUPONS: Coupon[] = [
  {
    id: 'cup_101',
    idNegocio: 'biz_001',
    descripcionDescuento: '20% en combos de hamburguesa doble',
    codigoQR: 'QR_CHAMO_20',
    fechaExpiracion: '2024-12-31T23:59:59Z'
  },
  {
    id: 'cup_102',
    idNegocio: 'biz_002',
    descripcionDescuento: '2x1 en pizzas margaritas los jueves',
    codigoQR: 'QR_PIZZA_2X1',
    fechaExpiracion: '2024-12-15T23:59:59Z'
  }
];

export const MOCK_USERS: User[] = [
  {
    id: 'user_999',
    historialCupones: ['cup_101'],
    ultimaUbicacion: { lat: 10.4850, lng: -66.9000 }
  }
];
