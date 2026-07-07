// signup.js
import { auth, db } from '../javascript/firebase-config.js';
import { createUserWithEmailAndPassword, deleteUser } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, setDoc, query, collection, where, getDocs, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const form      = document.getElementById('signupForm');
const submitBtn = document.querySelector('.signup-button');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    //Get values 
    const fullname = document.getElementById('fullname').value.trim();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const email    = document.getElementById('email').value.trim();
    const phone    = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;

    // Validation 
    let hasError = false;
    if (!fullname) { showError('fullname', 'Full name is required');      hasError = true; }
    if (!username) { showError('username', 'Username is required');        hasError = true; }
    if (!email)    { showError('email',    'Email is required');           hasError = true; }
    else if (!isValidEmail(email)) { showError('email', 'Invalid email'); hasError = true; }
    if (!phone)    { showError('phone',    'Phone number is required');    hasError = true; }
    if (!password) { showError('password', 'Password is required');        hasError = true; }
    else if (password.length < 6) { showError('password', 'Minimum 6 characters'); hasError = true; }
    if (hasError) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Creating Account...';

    let createdUser = null;

    try {
        // Create Firebase Auth user first 
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        createdUser = cred.user;

        // Check username uniqueness (
        const usernameQuery = query(
            collection(db, 'users'),
            where('username', '==', username),
            limit(1)
        );
        const usernameSnap = await getDocs(usernameQuery);

        if (!usernameSnap.empty) {
            // Username taken — delete the Auth account we just created
            await deleteUser(createdUser);
            showError('username', 'Username already taken');
            resetButton();
            return;
        }

        // Save user document in Firestore 
        await setDoc(doc(db, 'users', createdUser.uid), {
            fullname,
            username,           // already lowercased above
            email,
            phone,
            bio:       '',
            location:  '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        alert('Account created successfully!');
        window.location.href = 'login.html';

    } catch (error) {
        console.error('Signup error:', error);

        // If Firestore write failed but Auth user was created, clean it up
        if (createdUser) {
            try { await deleteUser(createdUser); } catch (_) {}
        }

        if (error.code === 'auth/email-already-in-use') {
            showError('email', 'Email already registered');
        } else if (error.code === 'auth/weak-password') {
            showError('password', 'Password too weak');
        } else {
            alert('Registration failed: ' + error.message);
        }

        resetButton();
    }
});

// Helpers
function showError(fieldId, message) {
    const input    = document.getElementById(fieldId);
    const errorDiv = document.getElementById(fieldId + 'Error');
    if (input)    input.classList.add('error');
    if (errorDiv) {
        errorDiv.textContent  = message;
        errorDiv.style.display = 'block';
        errorDiv.classList.add('show');
    }
}

function clearErrors() {
    document.querySelectorAll('input').forEach(i => i.classList.remove('error'));
    document.querySelectorAll('.error-message').forEach(m => {
        m.textContent  = '';
        m.style.display = 'none';
        m.classList.remove('show');
    });
}

function resetButton() {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Register';
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}