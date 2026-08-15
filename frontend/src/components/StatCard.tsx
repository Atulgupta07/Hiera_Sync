import React from "react";

export type StatCardProps = {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  bgTint?: string;       // e.g. "bg-[#E6FFFA]"
  accentColor?: string;  // e.g. "text-[#0D9488]"
  borderColor?: string; // e.g. "border-[#0D9488]/30"
  iconBg?: string;       // e.g. "bg-[#0D9488]/15"
  badgeText?: string;    // e.g. "+12% this week"
};

export default function StatCard({
  title,
  value,
  icon,
  bgTint = "bg-white",
  accentColor = "text-indigo-600",
  borderColor = "border-slate-200/80",
  iconBg = "bg-indigo-50",
  badgeText,
}: StatCardProps) {
  return (
    <div 
      className={`rounded-2xl p-6 border ${borderColor} ${bgTint} shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 tracking-wide">{title}</span>
        {icon && (
          <div className={`p-3 rounded-xl ${iconBg} ${accentColor} flex items-center justify-center shadow-inner`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <h2 className={`text-3xl sm:text-4xl font-extrabold ${accentColor} tracking-tight`}>
          {value}
        </h2>
        {badgeText && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/80 border border-slate-200 text-slate-600 shadow-2xs">
            {badgeText}
          </span>
        )}
      </div>
    </div>
  );
}