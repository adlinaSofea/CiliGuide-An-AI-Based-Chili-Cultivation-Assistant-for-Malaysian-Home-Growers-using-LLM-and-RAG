// Import Firebase instances from config file
import { auth } from '../javascript/firebase-config.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Form submission handler
document.getElementById('forgotPasswordForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    // Clear previous errors and success messages
    clearErrors();
    document.getElementById('successMessage').classList.remove('show');

    const email = document.getElementById('email').value.trim();
    let hasError = false;

    // Validate email
    if (email === '') {
        showError('email', 'Email is required');
        hasError = true;
    } else if (!email.includes('@')) {
        showError('email', 'Email must contain @');
        hasError = true;
    } else if (!isValidEmail(email)) {
        showError('email', 'Please enter a valid email address');
        hasError = true;
    }

    // If no errors, proceed with password reset
    if (!hasError) {
        try {
            // Show loading state
            const submitButton = document.querySelector('.send-email-button');
            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';

            // Send password reset email
            await sendPasswordResetEmail(auth, email);

            // Success!
            document.getElementById('successMessage').classList.add('show');
            document.getElementById('email').value = '';

            console.log('Password reset email sent to:', email);

            // Reset button
            submitButton.disabled = false;
            submitButton.textContent = 'Send Email';

        } catch (error) {
            // Handle Firebase errors
            console.error('Firebase error:', error);

            let errorMessage = 'Failed to send reset email. Please try again.';

            // Custom error messages based on Firebase error codes
            if (error.code === 'auth/user-not-found') {
                errorMessage = 'No account found with this email';
                showError('email', errorMessage);
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address';
                showError('email', errorMessage);
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = 'Too many attempts. Please try again later';
                showError('email', errorMessage);
            } else {
                alert(errorMessage);
            }

            // Reset button
            submitButton.disabled = false;
            submitButton.textContent = 'Send Email';
        }
    }
});

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorDiv = document.getElementById(fieldId + 'Error');

    input.classList.add('error');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

function clearErrors() {
    const inputs = document.querySelectorAll('input');
    const errors = document.querySelectorAll('.error-message');

    inputs.forEach(input => input.classList.remove('error'));
    errors.forEach(error => error.classList.remove('show'));
}

// Clear error on input
document.getElementById('email').addEventListener('input', function () {
    this.classList.remove('error');
    const errorDiv = document.getElementById('emailError');
    errorDiv.classList.remove('show');
    document.getElementById('successMessage').classList.remove('show');
});

// Add input animation
document.getElementById('email').addEventListener('focus', function () {
    this.parentElement.style.transform = 'translateX(5px)';
    this.parentElement.style.transition = 'transform 0.3s';
});

document.getElementById('email').addEventListener('blur', function () {
    this.parentElement.style.transform = 'translateX(0)';
});