import { useEffect, useState } from "react";
import { isManagedImage, resolveImageUrl } from "../services/imageStorage";

function ManagedImage({ value, alt, ...props }) {
  const [resolved, setResolved] = useState({ value: null, source: "" });

  useEffect(() => {
    let active = true;
    resolveImageUrl(value)
      .then((source) => { if (active) setResolved({ value, source }); })
      .catch(() => { if (active) setResolved({ value, source: "" }); });
    return () => { active = false; };
  }, [value]);

  const source = resolved.value === value ? resolved.source : "";
  if (!source) return null;
  return <img src={source} alt={alt} {...props} />;
}

export default function StoredImage({ value, alt = "", ...props }) {
  if (!value) return null;
  if (isManagedImage(value)) return <ManagedImage value={value} alt={alt} {...props} />;
  return <img src={value} alt={alt} {...props} />;
}
