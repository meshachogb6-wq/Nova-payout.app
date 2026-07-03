

```js
// NovaPayout config (edit anytime)
window.NOVAPAYOUT_CONFIG = {
  supabaseUrl: "https://jsinvatwqyjkqhkvtqiz.supabase.co",
  supabaseAnonKey: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",

  adminEmail: "meshachsopuru300@gmail.com",

  mining: {
    intervalMinutes: 5,
    amountPerMine: 35000
  },

  referral: {
    bonusAmount: 5000
  },

  withdrawalId: {
    feeAmount: 10000,
    otpMinutesValid: 10,
    codeFormat: "AAA-AAAAAA",
    emailSubject: "Your NovaPayout Withdrawal ID (Valid for 10 Minutes) The nova pay family"
  },

  bankForIdPayments: {
    accountNumber: "0044193121",
    accountName: "Nwoba Chinasa Anna",
    bankName: "GTBank"
  },

  levels: {
    Bronze: { price: 13000, dailyLimit: 175000 },
    Silver: { price: 15550, dailyLimit: 290000 },
    Gold: { price: 17500, dailyLimit: 400000 },
    Platinum: { price: 25000, dailyLimit: Infinity }
  },

  socialProof: {
    enabled: true,
    everyMsMin: 200000,
    everyMsMax: 450000,
    amountMin: 150000,
    amountMax: 90000,
    names: ["Chinedu","Amina","Ifeanyi","Blessing","Tunde","Zainab","Emeka","Chioma","Seyi","Fatima,"],
    cities: ["Lagos","Abuja","Port Harcourt","Enugu","Ibadan","Benin","Kaduna","Owerri,"]
  }
};
```

