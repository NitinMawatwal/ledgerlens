import api from "./api";

const TOKEN_KEY = "ledgerlens_token";
const USER_KEY = "ledgerlens_user";

export async function loginUser(credentials) {
  const response = await api.post("/auth/login", credentials);

  const { token, user } = response.data.data;

  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  return user;
}

export async function getCurrentUser() {
  const response = await api.get("/auth/me");

  const user = response.data.data.user;

  localStorage.setItem(USER_KEY, JSON.stringify(user));

  return user;
}

export function getStoredUser() {
  const user = localStorage.getItem(USER_KEY);

  return user ? JSON.parse(user) : null;
}

export function logoutUser() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
