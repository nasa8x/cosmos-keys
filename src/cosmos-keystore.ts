import { Wallet, StoredWallet } from './types';

const CryptoJS = require('crypto-js')

/*
 * This module assists in storing wallets encrypted in localstorage.
 * Wallets are stored by address to prevent accidental overwrite.
 * Loading and removal are protected by password checks.
 * This module also stores an index of all wallets by name for easy querying,
 * i.e. to show all wallets available.
 */

const KEY_TAG = `cosmos-wallets`

const keySize = 256
const iterations = 100

// loads and decrypts a wallet from localstorage
export function getStoredWallet(address: string, password: string): Wallet {
  const storedWallet = loadFromStorage(address)
  if (!storedWallet) {
    throw new Error('No wallet found for requested address')
  }

  try {
    const decrypted = decrypt(storedWallet.wallet, password)
    const wallet = JSON.parse(decrypted)

    return wallet
  } catch (err) {
    throw new Error(`Incorrect password`)
  }
}

// store a wallet encrypted in localstorage
export function storeWallet(wallet: Wallet, name: string, password: string): void {
  const storedWallet = loadFromStorage(wallet.cosmosAddress)
  if (storedWallet) {
    throw new Error("The wallet was already stored. Can't store the same wallet again.")
  }

  const ciphertext = encrypt(JSON.stringify(wallet), password)
  addToStorage(name, wallet.cosmosAddress, ciphertext)
}

// store a wallet encrypted in localstorage
export function removeWallet(address: string, password: string): void {
  const storedWallet = loadFromStorage(address)
  if (!storedWallet) throw new Error('No wallet found for requested address')

  // make sure the user really wants to delete the wallet
  // throws if password is incorrect
  testPassword(address, password)

  removeFromStorage(address)
}

// test password by trying to decrypt a key with said password
export function testPassword(address: string, password: string) {
  const storedWallet = loadFromStorage(address)
  if (!storedWallet) {
    throw new Error('No wallet found for request address')
  }

  try {
    // try to decode and check if is json format to proof that decoding worked
    const decrypted = decrypt(storedWallet.wallet, password)
    JSON.parse(decrypted)
  } catch (err) {
    throw new Error('Password for wallet is incorrect')
  }
}

// returns the index of the stored wallets
export function getWalletIndex(): [{ name: string; address: string }] {
  return JSON.parse(localStorage.getItem(KEY_TAG + '-index') || '[]')
}

// loads an encrypted wallet from localstorage
function loadFromStorage(address: string): StoredWallet | null {
  const storedKey = localStorage.getItem(KEY_TAG + '-' + address)
  if (!storedKey) {
    return null
  }
  return JSON.parse(storedKey)
}

// stores an encrypted wallet in localstorage
function addToStorage(name: string, address: string, ciphertext: string): void {
  addToIndex(name, address)

  const storedWallet: StoredWallet = {
    name,
    address,
    wallet: ciphertext
  }

  localStorage.setItem(KEY_TAG + '-' + address, JSON.stringify(storedWallet))
}

// removed a wallet from localstorage
function removeFromStorage(address: string): void {
  removeFromIndex(address)
  localStorage.removeItem(KEY_TAG + '-' + address)
}

// stores the names of the keys to prevent name collision
function addToIndex(name: string, address: string): void {
  const storedIndex = getWalletIndex()

  if (storedIndex.find(({ name: storedName }) => name === storedName)) {
    throw new Error(`Key with that name already exists`)
  }

  storedIndex.push({ name, address })
  localStorage.setItem(KEY_TAG + '-index', JSON.stringify(storedIndex))
}

function removeFromIndex(address: string): void {
  const storedIndex = getWalletIndex()

  const updatedIndex = storedIndex.filter(({ address: storedAddress }) => storedAddress !== address)
  localStorage.setItem(KEY_TAG + '-index', JSON.stringify(updatedIndex))
}

function encrypt(message: string, password: string): string {
  const salt = CryptoJS.lib.WordArray.random(128 / 8)

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: keySize / 32,
    iterations: iterations
  })

  const iv = CryptoJS.lib.WordArray.random(128 / 8)

  const encrypted = CryptoJS.AES.encrypt(message, key, {
    iv: iv,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC
  })

  // salt, iv will be hex 32 in length
  // append them to the ciphertext for use  in decryption
  const transitmessage = salt.toString() + iv.toString() + encrypted.toString()
  return transitmessage
}

function decrypt(transitMessage: string, password: string): string {
  const salt = CryptoJS.enc.Hex.parse(transitMessage.substr(0, 32))
  const iv = CryptoJS.enc.Hex.parse(transitMessage.substr(32, 32))
  const encrypted = transitMessage.substring(64)

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: keySize / 32,
    iterations: iterations
  })

  const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
    iv: iv,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC
  }).toString(CryptoJS.enc.Utf8)
  return decrypted
}
