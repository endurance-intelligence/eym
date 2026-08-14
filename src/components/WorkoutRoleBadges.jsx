export default function WorkoutRoleBadges({ assessment, className = "" }) {
  if (!assessment?.markers?.length) return null;
  return (
    <details
      className={`workout-role-badges ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <summary aria-label={`${assessment.markers.map((marker) => marker.label).join(" und ")}: Erklärung anzeigen`}>
        {assessment.markers.map((marker) => (
          <span className={marker.tone} key={marker.key}><i aria-hidden="true">{marker.icon}</i><b>{marker.label}</b></span>
        ))}
      </summary>
      <div className="workout-role-popover">
        <strong>{assessment.title}</strong>
        <p>{assessment.explanation}</p>
        {assessment.context && <small>{assessment.context}</small>}
      </div>
    </details>
  );
}
