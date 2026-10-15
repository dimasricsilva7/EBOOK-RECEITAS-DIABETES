export default function Loading() {
  return (
    <div className="container-page flex min-h-[60svh] items-center justify-center" aria-busy="true" aria-label="Carregando">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-primary" />
    </div>
  );
}
