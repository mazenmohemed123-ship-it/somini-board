import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "color" | "white";
  className?: string;
}

const sizeMap = {
  sm: { width: 100, height: 30 },
  md: { width: 160, height: 48 },
  lg: { width: 200, height: 60 },
};

export default function Logo({ size = "md", variant = "color", className }: LogoProps) {
  const { width, height } = sizeMap[size];

  return (
    <Image
      src="/images/logo.svg"
      alt="Somini Board"
      width={width}
      height={height}
      priority
      style={{
        filter: variant === "white" ? "brightness(0) invert(1)" : "none",
      }}
      className={className}
    />
  );
}
