import React from "react";

export type StatCardColor =
  | "blue"
  | "teal"
  | "purple"
  | "red"
  | "yellow"
  | "green";

interface StatCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: StatCardColor;
  subtitle?: string;
  variant?: "white" | "colored";
  onClick?: () => void;
}

const colorMap: Record<
  StatCardColor,
  {
    background: string;
    iconBackground: string;
    text: string;
  }
> = {
  blue: {
    background: "#3F51B5",
    iconBackground: "#3F51B5",
    text: "#FFFFFF",
  },

  teal: {
    background: "#26A69A",
    iconBackground: "#26A69A",
    text: "#FFFFFF",
  },

  purple: {
    background: "#8E24AA",
    iconBackground: "#8E24AA",
    text: "#FFFFFF",
  },

  red: {
    background: "#EF5350",
    iconBackground: "#EF5350",
    text: "#FFFFFF",
  },

  yellow: {
    background: "#FDD835",
    iconBackground: "#FDD835",
    text: "#263238",
  },

  green: {
    background: "#43A047",
    iconBackground: "#43A047",
    text: "#FFFFFF",
  },
};

export default function StatCard({
  title,
  value,
  icon,
  color = "blue",
  subtitle,
  variant = "white",
  onClick,
}: StatCardProps) {
  const colors = colorMap[color];

  if (variant === "colored") {
    return (
      <div
        onClick={onClick}
        className={`relative overflow-hidden rounded-sm border border-black/5 px-4 py-3 shadow-sm transition-all duration-200 ${
          onClick ? "cursor-pointer hover:-translate-y-[1px] hover:shadow-md" : ""
        }`}
        style={{
          backgroundColor: colors.background,
          color: colors.text,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-medium leading-none">
              {value}
            </div>

            <div className="mt-1 text-xs font-medium opacity-90">
              {title}
            </div>

            {subtitle && (
              <div className="mt-1 text-[11px] opacity-75">
                {subtitle}
              </div>
            )}
          </div>

          {icon && (
            <div className="text-4xl opacity-20">
              {icon}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 rounded-sm border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 ${
        onClick ? "cursor-pointer hover:-translate-y-[1px] hover:shadow-md" : ""
      }`}
    >
      {icon && (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-white"
          style={{
            backgroundColor: colors.iconBackground,
          }}
        >
          {icon}
        </div>
      )}

      <div className="min-w-0">
        <div className="text-2xl font-medium leading-none text-gray-800">
          {value}
        </div>

        <div className="mt-1 text-xs text-gray-500">
          {title}
        </div>

        {subtitle && (
          <div className="mt-1 text-[11px] text-gray-400">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}