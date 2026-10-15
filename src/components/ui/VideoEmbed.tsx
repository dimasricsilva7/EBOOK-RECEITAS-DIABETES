import { LazyVideo } from "./LazyVideo";

/** Converte links do YouTube/Vimeo em URL de embed. Retorna null para arquivos de vídeo. */
export function videoEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&playsinline=1`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d{5,12})/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/** Vídeo por arquivo (MP4/WebM, upload ou link direto) ou por link do YouTube/Vimeo. */
export function VideoEmbed({ url, title, className = "", vertical = false }: { url: string; title: string; className?: string; vertical?: boolean }) {
  const embed = videoEmbedUrl(url);
  if (embed) {
    return (
      <div className={`relative overflow-hidden bg-ink ${vertical ? "aspect-[9/16]" : "aspect-video"} ${className}`}>
        <iframe src={embed} title={title} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full" />
      </div>
    );
  }
  return <LazyVideo url={url} title={title} className={className} vertical={vertical} />;
}
