/**
 * Principales municipios de Colombia por departamento.
 * Fuente: DIVIPOLA - DANE 2024.
 * Solo se incluyen los municipios con mayor actividad contractual en SECOP II.
 */
export const MUNICIPALITIES_BY_DEPARTMENT: Record<string, string[]> = {
  'Amazonas': ['Leticia', 'Puerto Nariño'],
  'Antioquia': ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Rionegro', 'Sabaneta', 'La Estrella', 'Copacabana', 'Apartadó', 'Turbo', 'Caucasia', 'Yarumal', 'Santa Fe de Antioquia', 'Marinilla', 'El Carmen de Viboral'],
  'Arauca': ['Arauca', 'Saravena', 'Tame', 'Arauquita', 'Fortul'],
  'Atlántico': ['Barranquilla', 'Soledad', 'Malambo', 'Sabanalarga', 'Baranoa', 'Santo Tomás', 'Palmar de Varela', 'Puerto Colombia'],
  'Bogotá D.C.': ['Bogotá'],
  'Bolívar': ['Cartagena', 'Magangué', 'El Carmen de Bolívar', 'Mompox', 'Arjona', 'Turbaco'],
  'Boyacá': ['Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá', 'Paipa', 'Villa de Leyva', 'Moniquirá'],
  'Caldas': ['Manizales', 'La Dorada', 'Chinchiná', 'Riosucio', 'Villamaría', 'Anserma'],
  'Caquetá': ['Florencia', 'San Vicente del Caguán', 'Puerto Rico', 'Belén de los Andaquíes'],
  'Casanare': ['Yopal', 'Aguazul', 'Tauramena', 'Villanueva', 'Paz de Ariporo'],
  'Cauca': ['Popayán', 'Santander de Quilichao', 'Puerto Tejada', 'Patía', 'Piendamó'],
  'Cesar': ['Valledupar', 'Aguachica', 'Bosconia', 'El Copey', 'La Paz'],
  'Chocó': ['Quibdó', 'Istmina', 'Turbo', 'Riosucio', 'Condoto'],
  'Córdoba': ['Montería', 'Sahagún', 'Cereté', 'Lorica', 'Montelíbano', 'Planeta Rica'],
  'Cundinamarca': ['Soacha', 'Fusagasugá', 'Facatativá', 'Zipaquirá', 'Chía', 'Mosquera', 'Madrid', 'Funza', 'Cajicá', 'Sibaté', 'La Mesa', 'Girardot'],
  'Guainía': ['Inírida'],
  'Guaviare': ['San José del Guaviare', 'El Retorno', 'Calamar'],
  'Huila': ['Neiva', 'Pitalito', 'Garzón', 'La Plata', 'Campoalegre'],
  'La Guajira': ['Riohacha', 'Maicao', 'Uribia', 'Manaure', 'San Juan del Cesar'],
  'Magdalena': ['Santa Marta', 'Ciénaga', 'Fundación', 'El Banco', 'Plato'],
  'Meta': ['Villavicencio', 'Acacías', 'Granada', 'San Martín', 'Cumaral'],
  'Nariño': ['Pasto', 'Tumaco', 'Ipiales', 'Tumaco', 'La Unión', 'Samaniego'],
  'Norte de Santander': ['Cúcuta', 'Ocaña', 'Pamplona', 'Villa del Rosario', 'Los Patios'],
  'Putumayo': ['Mocoa', 'Puerto Asís', 'Orito', 'Sibundoy', 'Valle del Guamuez'],
  'Quindío': ['Armenia', 'Calarcá', 'Quimbaya', 'Montenegro', 'Circasia'],
  'Risaralda': ['Pereira', 'Dosquebradas', 'Santa Rosa de Cabal', 'La Virginia', 'Cartago'],
  'San Andrés y Providencia': ['San Andrés', 'Providencia'],
  'Santander': ['Bucaramanga', 'Floridablanca', 'Girón', 'Piedecuesta', 'Barrancabermeja', 'San Gil', 'Socorro'],
  'Sucre': ['Sincelejo', 'Corozal', 'San Marcos', 'Tolú', 'Sampués'],
  'Tolima': ['Ibagué', 'Espinal', 'Melgar', 'Honda', 'Chaparral', 'Líbano'],
  'Valle del Cauca': ['Cali', 'Palmira', 'Buenaventura', 'Tuluá', 'Buga', 'Cartago', 'Yumbo', 'Jamundí', 'Candelaria', 'Florida'],
  'Vaupés': ['Mitú'],
  'Vichada': ['Puerto Carreño'],
};

export function getMunicipalitiesByDepartment(department: string): string[] {
  return MUNICIPALITIES_BY_DEPARTMENT[department] ?? [];
}
