const sidebar = document.querySelector(".sidebar");
const main = document.querySelector(".main");
const sidebarToggle = document.getElementById("sidebarToggle");

if (sidebar && main && sidebarToggle) {
  sidebarToggle.addEventListener("click", function () {
    const isCollapsed = sidebar.classList.toggle("collapsed");

    main.classList.toggle("sidebar-collapsed", isCollapsed);

    sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
    sidebarToggle.setAttribute(
      "aria-label",
      isCollapsed ? "Expand sidebar" : "Collapse sidebar",
    );
  });
}

const adminPortal = document.getElementById("adminPortalLink");

const adminSession = sessionStorage.getItem("noblessAdminSession");

if (!adminSession && adminPortal) {
  adminPortal.style.display = "none";
}
