type BrandMarkSize = "hero" | "chrome" | "compact";

export function BrandMark({
  size = "chrome",
  className = "",
}: {
  size?: BrandMarkSize;
  className?: string;
}) {
  return (
    <span
      className={`brand-mark brand-mark--${size} ${className}`.trim()}
      aria-hidden={size === "hero" ? undefined : true}
    >
      <svg className="brand-mark__badge" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="3" fill="#0C0D10" />
        <rect x="0" y="0" width="4" height="48" fill="#E10600" />
        <text
          x="27"
          y="32"
          text-anchor="middle"
          fill="#F4F1EA"
          fontFamily="Bebas Neue, Arial Narrow, Impact, sans-serif"
          fontSize="20"
          letterSpacing="1.2"
        >
          PG
        </text>
        <rect x="12" y="38" width="24" height="2" fill="#F5C518" />
      </svg>
      {size === "hero" ? (
        <span className="brand-mark__lockup">
          <span className="brand-mark__name">
            Perfect
            <span>Grid</span>
          </span>
          <span className="brand-mark__tag">#PerfectGrid</span>
        </span>
      ) : size === "chrome" ? (
        <span className="brand-mark__word">Perfect Grid</span>
      ) : null}
    </span>
  );
}
