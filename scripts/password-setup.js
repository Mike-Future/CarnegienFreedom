// SHA-256 hash function
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

document.getElementById('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (password !== confirm) {
        alert('Passwords do not match!');
        return;
    }

    if (password.length < 8) {
        alert('Password must be at least 8 characters long!');
        return;
    }

    // Generate hash
    const hash = await sha256(password);

    // Show result
    document.getElementById('hashOutput').textContent = hash;
    document.getElementById('resultBox').classList.add('show');
});

function copyHash() {
    const hash = document.getElementById('hashOutput').textContent;
    navigator.clipboard.writeText(hash).then(() => {
        alert('Hash copied to clipboard!');
    });
}