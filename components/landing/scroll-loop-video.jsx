export function ScrollLoopVideo() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/landing-scroll-loop.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />

      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,118,110,0.55),rgba(29,78,216,0.4),rgba(217,119,6,0.35))] mix-blend-multiply" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.22),transparent_52%),radial-gradient(circle_at_85%_75%,rgba(255,255,255,0.14),transparent_48%)]" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#f4f8fb] to-transparent" />
    </section>
  );
}
