declare module "pdfmake/build/pdfmake.js" {
  const pdfMake: {
    addVirtualFileSystem: (vfs: unknown) => void;
    setFonts: (fonts: Record<string, Record<string, string>>) => void;
    createPdf: (def: unknown) => { getBuffer: () => Promise<Buffer | Uint8Array> };
  };
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts.js" {
  const vfs: Record<string, string>;
  export default vfs;
}
