// Carga el logo (public/logo.png) como imagen para ponerlo en los PDF.
// Si no se puede leer, devuelve null y el PDF se genera igual, sin logo.
export const loadLogoDataUrl = async (): Promise<string | null> => {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

// Posición estándar del logo en los PDF: arriba a la izquierda, y el texto
// del encabezado se corre a la derecha (x = PDF_TEXT_X_WITH_LOGO).
export const PDF_LOGO_SIZE = 18;
export const PDF_TEXT_X_WITH_LOGO = 36;
