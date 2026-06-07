// javascript/auth.js — shared auth client, import on every page that needs it
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
    "https://zewoxdagbywjubofwvde.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld294ZGFnYnl3anVib2Z3dmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MjcwNzQsImV4cCI6MjA5NjQwMzA3NH0.EO-I8ghrhP7OhYFOTWmrfNGh6kR98yypC37Yc6eA64E"
);

export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

export async function getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
}

// Call on every page — updates nav login/account/signout links
export async function updateNavAuth() {
    const user = await getUser();
    const loginLink   = document.getElementById("nav-login");
    const accountLink = document.getElementById("nav-account");
    const signoutLink = document.getElementById("nav-signout");
    if (user) {
        if (loginLink)    loginLink.style.display   = "none";
        if (accountLink)  accountLink.style.display  = "inline";
        if (signoutLink) {
            signoutLink.style.display = "inline";
            signoutLink.addEventListener("click", e => { e.preventDefault(); signOut(); });
        }
    } else {
        if (loginLink)    loginLink.style.display   = "inline";
        if (accountLink)  accountLink.style.display  = "none";
        if (signoutLink)  signoutLink.style.display  = "none";
    }
}