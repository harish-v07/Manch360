// Razorpay Linked Account Cleanup Script
// Run with: deno run --allow-net --allow-env cleanup_linked_accounts.ts
// Or set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET as environment variables

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") || prompt("Enter Razorpay Key ID: ");
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || prompt("Enter Razorpay Key Secret: ");

if (!KEY_ID || !KEY_SECRET) {
  console.error("Missing Razorpay credentials");
  Deno.exit(1);
}

const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);

async function fetchLinkedAccounts() {
  const response = await fetch("https://api.razorpay.com/v2/accounts?type=route&count=100", {
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Error fetching accounts:", data);
    return [];
  }
  return data.items || [];
}

async function deleteLinkedAccount(accountId: string) {
  // Razorpay doesn't have a direct delete API for linked accounts.
  // We can only suspend/deactivate them.
  // Patch the account to set it to suspended state.
  const response = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ profile: { suspended: true } }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error(`Failed to deactivate ${accountId}:`, data.error?.description || data);
    return false;
  }
  console.log(`✓ Deactivated: ${accountId} (${data.legal_business_name || data.email})`);
  return true;
}

console.log("Fetching all Razorpay Route Linked Accounts...\n");
const accounts = await fetchLinkedAccounts();

if (accounts.length === 0) {
  console.log("No linked accounts found.");
  Deno.exit(0);
}

console.log(`Found ${accounts.length} linked account(s):\n`);
accounts.forEach((acc: any, i: number) => {
  console.log(`${i + 1}. ${acc.id} - ${acc.legal_business_name || acc.email} (${acc.status})`);
});

const confirm = prompt(`\nDeactivate all ${accounts.length} account(s)? (yes/no): `);
if (confirm?.toLowerCase() !== "yes") {
  console.log("Aborted.");
  Deno.exit(0);
}

console.log("\nDeactivating accounts...");
let success = 0;
let failed = 0;

for (const account of accounts) {
  const ok = await deleteLinkedAccount(account.id);
  if (ok) success++;
  else failed++;
}

console.log(`\nDone! Deactivated: ${success}, Failed: ${failed}`);
console.log("\nNote: Razorpay does not allow permanent deletion of linked accounts via API.");
console.log("Deactivated accounts will no longer receive transfers.");
