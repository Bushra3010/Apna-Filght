/** A safe file name piece, e.g. INV-0001 */
export const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9_-]+/g, '-')
