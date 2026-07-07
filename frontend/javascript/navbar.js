import { auth } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {

    // Mobile menu
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.getElementById('navMenu');

    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    // Dropdown
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    const dropdown = document.querySelector('.dropdown');

    if (dropdownToggle && dropdown) {
        dropdownToggle.addEventListener('click', (e) => {
            e.preventDefault();
            dropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    }

    // Firebase Auth
    const navAuth = document.getElementById('nav-auth');
    onAuthStateChanged(auth, (user) => {
        if (!navAuth) return;
        navAuth.innerHTML = user
            ? `<a href="dashboard.html">Dashboard</a>`
            : `<a href="login.html">Login</a>`;
    });

    // Logout toast
    if (sessionStorage.getItem('logoutSuccess')) {
        showToast('👋', 'Logged Out', 'You have successfully logged out.');
        sessionStorage.removeItem('logoutSuccess');
    }

});

function showToast(icon, title, msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;                          

    document.getElementById('toastIcon').textContent = icon;
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMsg').textContent = msg;

    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}