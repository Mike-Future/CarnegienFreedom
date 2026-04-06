// LegitWays Dynamic Database Layer
// Uses IndexedDB for persistent client-side storage
// No backend required - works entirely in the browser

const DB_NAME = 'LegitWaysDB';
const DB_VERSION = 1;
const STORE_POSTS = 'posts';
const STORE_CATEGORIES = 'categories';
const STORE_SETTINGS = 'settings';

let db = null;

// ==================== DATABASE INITIALIZATION ====================

// Initialize the database
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Posts store
            if (!database.objectStoreNames.contains(STORE_POSTS)) {
                const postsStore = database.createObjectStore(STORE_POSTS, { keyPath: 'id' });
                postsStore.createIndex('slug', 'slug', { unique: true });
                postsStore.createIndex('category', 'category', { unique: false });
                postsStore.createIndex('date', 'date', { unique: false });
                postsStore.createIndex('featured', 'featured', { unique: false });
            }

            // Categories store
            if (!database.objectStoreNames.contains(STORE_CATEGORIES)) {
                const catStore = database.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
            }

            // Settings store
            if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
                database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
            }
        };
    });
}

// ==================== POSTS CRUD OPERATIONS ====================

// Get all posts
async function getAllPosts() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_POSTS], 'readonly');
        const store = transaction.objectStore(STORE_POSTS);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get post by slug
async function getPostBySlug(slug) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_POSTS], 'readonly');
        const store = transaction.objectStore(STORE_POSTS);
        const index = store.index('slug');
        const request = index.get(slug);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get posts by category
async function getPostsByCategory(category) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_POSTS], 'readonly');
        const store = transaction.objectStore(STORE_POSTS);
        const index = store.index('category');
        const request = index.getAll(category);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get featured posts
async function getFeaturedPosts() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_POSTS], 'readonly');
        const store = transaction.objectStore(STORE_POSTS);
        const index = store.index('featured');
        const request = index.getAll(true);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Add or update post
async function savePost(post) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_POSTS], 'readwrite');
        const store = transaction.objectStore(STORE_POSTS);
        const request = store.put(post);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete post
async function deletePost(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_POSTS], 'readwrite');
        const store = transaction.objectStore(STORE_POSTS);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Search posts
async function searchPosts(query) {
    const allPosts = await getAllPosts();
    const lowerQuery = query.toLowerCase();

    return allPosts.filter(post => 
        post.title.toLowerCase().includes(lowerQuery) ||
        post.excerpt.toLowerCase().includes(lowerQuery) ||
        post.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        post.categoryLabel.toLowerCase().includes(lowerQuery)
    );
}

// ==================== CATEGORIES OPERATIONS ====================

// Get all categories
async function getAllCategories() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_CATEGORIES], 'readonly');
        const store = transaction.objectStore(STORE_CATEGORIES);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Save category
async function saveCategory(category) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_CATEGORIES], 'readwrite');
        const store = transaction.objectStore(STORE_CATEGORIES);
        const request = store.put(category);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Update category counts
async function updateCategoryCounts() {
    const posts = await getAllPosts();
    const categories = await getAllCategories();

    for (const category of categories) {
        const count = posts.filter(p => p.category === category.id).length;
        category.count = count;
        await saveCategory(category);
    }
}

// ==================== SETTINGS OPERATIONS ====================

// Get setting
async function getSetting(key, defaultValue = null) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_SETTINGS], 'readonly');
        const store = transaction.objectStore(STORE_SETTINGS);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result?.value || defaultValue);
        request.onerror = () => reject(request.error);
    });
}

// Save setting
async function saveSetting(key, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_SETTINGS], 'readwrite');
        const store = transaction.objectStore(STORE_SETTINGS);
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ==================== DATA IMPORT/EXPORT ====================

// Export all data as JSON
async function exportAllData() {
    const posts = await getAllPosts();
    const categories = await getAllCategories();

    return {
        posts: posts.sort((a, b) => new Date(b.date) - new Date(a.date)),
        categories: categories
    };
}

// Import data from JSON
async function importData(data) {
    // Clear existing data
    await clearAllData();

    // Import categories
    if (data.categories) {
        for (const category of data.categories) {
            await saveCategory(category);
        }
    }

    // Import posts
    if (data.posts) {
        for (const post of data.posts) {
            await savePost(post);
        }
    }

    return { posts: data.posts?.length || 0, categories: data.categories?.length || 0 };
}

// Clear all data
async function clearAllData() {
    const transaction = db.transaction([STORE_POSTS, STORE_CATEGORIES], 'readwrite');

    await Promise.all([
        new Promise((resolve, reject) => {
            const request = transaction.objectStore(STORE_POSTS).clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        }),
        new Promise((resolve, reject) => {
            const request = transaction.objectStore(STORE_CATEGORIES).clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        })
    ]);
}

// ==================== INITIALIZATION ====================

// Initialize with default data if empty
async function initializeWithDefaults() {
    const posts = await getAllPosts();

    if (posts.length === 0) {
        // Load default data from JSON file
        try {
            const response = await fetch('blog-data.json');
            const defaultData = await response.json();
            await importData(defaultData);
            console.log('Database initialized with default data');
        } catch (error) {
            console.error('Failed to load default data:', error);
            // Initialize with empty structure
            await initializeCategories();
        }
    }
}

// Initialize default categories
async function initializeCategories() {
    const defaultCategories = [
        { id: 'scam-awareness', name: 'Scam Awareness', count: 0 },
        { id: 'education', name: 'Education', count: 0 },
        { id: 'opportunities', name: 'Opportunities', count: 0 },
        { id: 'lifestyle', name: 'Lifestyle', count: 0 }
    ];

    for (const category of defaultCategories) {
        await saveCategory(category);
    }
}

// ==================== PUBLIC API ====================

// Initialize database and return API
async function initDB() {
    await initDatabase();
    await initializeWithDefaults();

    return {
        // Posts
        getAllPosts,
        getPostBySlug,
        getPostsByCategory,
        getFeaturedPosts,
        savePost,
        deletePost,
        searchPosts,

        // Categories
        getAllCategories,
        saveCategory,
        updateCategoryCounts,

        // Settings
        getSetting,
        saveSetting,

        // Import/Export
        exportAllData,
        importData,
        clearAllData
    };
}

// Make available globally
window.LegitWaysDB = { initDB };
