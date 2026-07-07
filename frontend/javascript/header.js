async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        const html = await response.text();
        document.getElementById(elementId).innerHTML = html;
    } catch (error) {
        console.error("Error loading component:", error);
    }
}

document.addEventListener("DOMContentLoaded", async function () {

    await loadComponent("header-container", "../components/header.html");
   
    initializeDropdown();
});

function initializeDropdown() {
    const dropdownToggle = document.querySelector(".dropdown-toggle");
    const dropdown = document.querySelector(".dropdown");

    if (dropdownToggle && dropdown) {
        dropdownToggle.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle("active");
        });

        document.addEventListener("click", function (e) {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove("active");
            }
        });
    }
}

function toggleMenu() {
    const menu = document.getElementById("navMenu");
    if (menu) {
        menu.classList.toggle("active");
    }
}
