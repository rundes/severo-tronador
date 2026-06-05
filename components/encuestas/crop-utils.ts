// Recorta una imagen (canvas) según el área en píxeles que devuelve
// react-easy-crop. Exporta JPEG (más liviano para banners). Limita el ancho
// de salida para no subir imágenes enormes.
export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_OUT_WIDTH = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("no se pudo cargar la imagen"));
    img.src = src;
  });
}

export async function getCroppedBlob(
  imageSrc: string,
  crop: PixelCrop,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const scale = crop.width > MAX_OUT_WIDTH ? MAX_OUT_WIDTH / crop.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas no disponible");
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("falló el recorte"))),
      "image/jpeg",
      0.9,
    );
  });
}
