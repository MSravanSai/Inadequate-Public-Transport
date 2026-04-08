export default function CrowdBadge({ level }) {
  const config = {
    low: { label: 'Low', class: 'bg-green-100 text-green-700 border-green-200' },
    moderate: { label: 'Moderate', class: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    high: { label: 'High', class: 'bg-orange-100 text-orange-700 border-orange-200' },
    critical: { label: 'Critical', class: 'bg-red-100 text-red-700 border-red-200' },
  };
  const c = config[level] || config.low;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.class}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {c.label}
    </span>
  );
}