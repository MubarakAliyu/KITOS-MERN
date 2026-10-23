"use client";

const SIZES = {
  sm: "h-12 w-12 text-xl",
  md: "h-32 w-full text-5xl",
  lg: "h-48 w-full text-7xl",
};

// Per-course gradient when no thumbnail image is uploaded. The c1/c2/c3
// branches keep the look consistent with what the dashboards used before
// thumbnails landed; everything else gets a neutral gradient.
const GRADIENTS = {
  c1: "from-teal-500 to-teal-700",
  c2: "from-blue-500 to-blue-700",
  c3: "from-purple-500 to-purple-700",
  default: "from-gray-500 to-gray-700",
};

export default function CourseThumbnail({
  course,
  size = "md",
  className = "",
}) {
  const sizeClass = SIZES[size] ?? SIZES.md;
  const gradient = GRADIENTS[course?.id] ?? GRADIENTS.default;

  if (course?.thumbnail_url) {
    return (
      <div
        className={`relative overflow-hidden ${sizeClass} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={course.thumbnail_url}
          alt={course.title ?? "Course thumbnail"}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const initial = course?.title?.charAt(0).toUpperCase() ?? "?";
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} ${sizeClass} ${className}`}
    >
      <span className="select-none font-bold text-white drop-shadow">
        {initial}
      </span>
    </div>
  );
}

export { CourseThumbnail };
