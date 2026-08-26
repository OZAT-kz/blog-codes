// ==============================================================================
// react-firebase-claims-provider.tsx
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/react-firebase-claims-provider.tsx
// ==============================================================================


// React: Пайдаланушы статусын тексеру
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, getIdTokenResult } from 'firebase/auth';

export const useAdStrategy = () => {
    const [showAds, setShowAds] = useState<boolean | null>(null); // null = жүктелуде

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // claims аламыз. Жылдамдық үшін ForceRefresh = false!
                const tokenResult = await getIdTokenResult(user, false);
                const isWhale = tokenResult.claims.is_whale === true;
                setShowAds(!isWhale);
            } else {
                // Логин жасамағандарға - жарнаманы толықтай көрсетеміз
                setShowAds(true);
            }
        });
        return () => unsubscribe();
    }, []);

    return showAds;
};
