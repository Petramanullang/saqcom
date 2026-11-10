export const JURUSAN = [
  { kode: 'IT', nama: 'Teknik Informatika (IT)' },
  { kode: 'SI', nama: 'Sistem Informasi (SI)' },
  { kode: 'SD', nama: 'Sains Data (SD)' },
];

/** Kelompokkan kode jurusan untuk statistik dashboard. */
export function grupJurusan(j: string): 'TI' | 'SI' | 'Lain' {
  const u = (j || '').toUpperCase();
  if (u === 'IT' || u === 'TI' || u.includes('INFORMATIKA')) return 'TI';
  if (u === 'IS' || u === 'SI' || u.includes('INFORMASI')) return 'SI';
  return 'Lain';
}
