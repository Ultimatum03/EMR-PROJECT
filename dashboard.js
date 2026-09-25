// Sidebar (including collapse) is rendered by sidebar.js.

const adminPortal =
    document.getElementById("adminPortalLink");


const adminSession =
    sessionStorage.getItem(
        "noblessAdminSession"
    );


if (!adminSession && adminPortal) {

    adminPortal.style.display = "none";

}