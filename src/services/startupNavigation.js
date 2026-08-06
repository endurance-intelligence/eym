const AUTH_CALLBACK_PARAMETER = /(?:^|[?#&])(access_token|refresh_token|provider_token|code|error|error_code|error_description|type)=/i;

export function briefingStartupUrl(locationLike = {}) {
  const pathname = locationLike.pathname || "/";
  const search = locationLike.search || "";
  return `${pathname}${search}#/`;
}

export function isAuthCallbackLocation(locationLike = {}) {
  const search = String(locationLike.search || "");
  const hash = String(locationLike.hash || "");
  return AUTH_CALLBACK_PARAMETER.test(`${search}&${hash}`);
}

export function shouldResetToBriefing(locationOrHash = "") {
  if (typeof locationOrHash === "object" && locationOrHash !== null) {
    if (isAuthCallbackLocation(locationOrHash)) return false;
    return shouldResetToBriefing(locationOrHash.hash || "");
  }
  return !["", "#", "#/"].includes(String(locationOrHash || ""));
}

export function resetStartupLocationToBriefing(locationLike = {}, historyLike = {}) {
  if (!shouldResetToBriefing(locationLike)) return false;
  if (typeof historyLike.replaceState !== "function") return false;
  historyLike.replaceState(historyLike.state, "", briefingStartupUrl(locationLike));
  return true;
}
