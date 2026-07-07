// login.js
import { auth } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    setPersistence,
    browserSessionPersistence,
    sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const form      = document.getElementById('loginForm');
const submitBtn = document.querySelector('.login-button');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        const emailRaw = document.getElementById('username')?.value ?? '';
        const password = document.getElementById('password')?.value ?? '';

        
        const email = emailRaw.trim().toLowerCase();

        // Validation
        let hasError = false;
        if (!email) {
            showError('username', 'Email is required');
            hasError = true;
        } else if (!isValidEmail(email)) {
            showError('username', 'Please enter a valid email address');
            hasError = true;
        }
        if (!password) {
            showError('password', 'Password is required');
            hasError = true;
        }
        if (hasError) return;

        submitBtn.disabled    = true;
        submitBtn.textContent = 'Logging in...';

        try {
            await setPersistence(auth, browserSessionPersistence);

            console.log('[Login] attempting signIn with:', email);
            await signInWithEmailAndPassword(auth, email, password);

            console.log('[Login] success, redirecting...');
            alert('Login successful! Welcome 🖐🏻');
            window.location.href = 'index.html';

        } catch (error) {
            console.error('[Login] error code:', error.code);
            console.error('[Login] error message:', error.message);

            switch (error.code) {
                case 'auth/invalid-email':
                    showError('username', 'Invalid email address format.');
                    break;
                case 'auth/invalid-credential':
                case 'auth/wrong-password':
                case 'auth/user-not-found':
                    showError('password', 'Incorrect email or password. If you just registered, try resetting your password.');
                    break;
                case 'auth/too-many-requests':
                    showError('username', 'Too many failed attempts. Please try again later or reset your password.');
                    break;
                case 'auth/user-disabled':
                    showError('username', 'This account has been disabled.');
                    break;
                case 'auth/network-request-failed':
                    showError('username', 'Network error. Check your connection.');
                    break;
                default:
                    showError('username', `Login failed: ${error.code}`);
            }

            resetButton();
        }
    });
}

//Helpers 
function isValidEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function resetButton() {
    if (!submitBtn) return;
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Login';
}

function showError(fieldId, message) {
    const input    = document.getElementById(fieldId);
    const errorDiv = document.getElementById(fieldId + 'Error');
    if (input)    input.classList.add('error');
    if (errorDiv) {
        errorDiv.textContent   = message;
        errorDiv.style.display = 'block';
    }
}

function clearErrors() {
    document.querySelectorAll('input').forEach(i => i.classList.remove('error'));
    document.querySelectorAll('.error-message').forEach(m => {
        m.textContent   = '';
        m.style.display = 'none';
    });
}