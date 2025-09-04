// utils/generateUsername.js
export function generateUsernameForCourse(user, course, serial) {
  const fname = user.f_name || "";
  const lname = user.last_name || "";
  const district = user.district || "";

  // If course format is "none", no username
  if (course.usernameFormat === "none") {
    return { username: null, serial: null };
  }

  // If course format is "custom" and has placeholders
  if (course.usernameFormat && course.usernameFormat !== "auto") {
    const username = course.usernameFormat
      .replace("{serial}", serial || "")
      .replace("{fname}", fname)
      .replace("{lname}", lname)
      .replace("{district}", district);
    return { username, serial };
  }

  // Default or "auto" format
  const username = `${serial}.${fname}${lname}.${district}`;
  return { username, serial };
}
