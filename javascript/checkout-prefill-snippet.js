// Fix 4 — Pre-fill checkout from profile if user is logged in
// Add this to your checkout.html AFTER your existing scripts
// Requires: import { supabase, getUser } from "/javascript/auth.js"

(async () => {
    try {
        const { supabase, getUser } = await import("/javascript/auth.js");
        const user = await getUser();
        if (!user) return; // guest, skip

        // Try profile first, fallback to user metadata
        const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, phone, address")
            .eq("id", user.id)
            .single();

        const nameEl    = document.getElementById("name");
        const emailEl   = document.getElementById("email");
        const phoneEl   = document.getElementById("phone");
        const addressEl = document.getElementById("address");

        if (nameEl && !nameEl.value)    nameEl.value    = profile?.full_name || user.user_metadata?.full_name || "";
        if (emailEl && !emailEl.value)  emailEl.value   = user.email || "";
        if (phoneEl && !phoneEl.value)  phoneEl.value   = profile?.phone || "";
        if (addressEl && !addressEl.value) addressEl.value = profile?.address || "";
    } catch {}
})();