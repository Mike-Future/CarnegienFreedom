const API_ROOT = '/api';

async function request(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        ...options
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} ${text}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

async function initDB() {
    await request('/health');

    return {
        getAllPosts,
        getPostBySlug,
        getPostsByCategory,
        getFeaturedPosts,
        savePost,
        deletePost,
        searchPosts,
        getAllCategories,
        saveCategory,
        updateCategoryCounts,
        getSetting,
        saveSetting,
        exportAllData,
        importData,
        clearAllData
    };
}

async function getAllPosts() {
    return request('/posts');
}

async function getPostBySlug(slug) {
    return request(`/posts/slug/${encodeURIComponent(slug)}`);
}

async function getPostsByCategory(category) {
    if (!category || category === 'all') {
        return getAllPosts();
    }
    return request(`/posts/category/${encodeURIComponent(category)}`);
}

async function getFeaturedPosts() {
    return request('/posts/featured');
}

async function savePost(post) {
    return request('/posts', {
        method: 'POST',
        body: JSON.stringify(post)
    });
}

async function deletePost(id) {
    return request(`/posts/${encodeURIComponent(id)}`, {
        method: 'DELETE'
    });
}

async function searchPosts(query) {
    const q = String(query || '').trim();
    if (!q) {
        return getAllPosts();
    }
    return request(`/posts/search?q=${encodeURIComponent(q)}`);
}

async function getAllCategories() {
    return request('/categories');
}

async function saveCategory(category) {
    return request('/categories', {
        method: 'POST',
        body: JSON.stringify(category)
    });
}

async function updateCategoryCounts() {
    return request('/categories/update-counts', {
        method: 'POST'
    });
}

async function getSetting(key, defaultValue = null) {
    try {
        return await request(`/settings/${encodeURIComponent(key)}`);
    } catch (error) {
        return defaultValue;
    }
}

async function saveSetting(key, value) {
    return request('/settings', {
        method: 'POST',
        body: JSON.stringify({ key, value })
    });
}

async function exportAllData() {
    return request('/data/export');
}

async function importData(data) {
    return request('/data/import', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

async function clearAllData() {
    return request('/data/clear', {
        method: 'POST'
    });
}

window.LegitWaysDB = { initDB };
