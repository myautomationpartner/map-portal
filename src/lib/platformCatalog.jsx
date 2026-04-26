import { FaLinkedinIn } from 'react-icons/fa'
import { SiFacebook, SiGoogle, SiInstagram, SiTiktok, SiX } from 'react-icons/si'

export const PLATFORM_CATALOG = {
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    shortLabel: 'IG',
    metricLabel: 'Followers',
    metricField: 'followers',
    accent: '#d85f98',
    soft: 'rgba(216, 95, 152, 0.12)',
    connectionEnabled: true,
    Icon: SiInstagram,
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    shortLabel: 'FB',
    metricLabel: 'Followers',
    metricField: 'followers',
    accent: '#3568a6',
    soft: 'rgba(53, 104, 166, 0.12)',
    connectionEnabled: true,
    Icon: SiFacebook,
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TT',
    metricLabel: 'Followers',
    metricField: 'followers',
    accent: '#111111',
    soft: 'rgba(17, 17, 17, 0.08)',
    connectionEnabled: true,
    Icon: SiTiktok,
  },
  google: {
    id: 'google',
    label: 'Google Business',
    shortLabel: 'GBP',
    metricLabel: 'Reach',
    metricField: 'reach',
    accent: '#1fa971',
    soft: 'rgba(31, 169, 113, 0.12)',
    connectionEnabled: false,
    Icon: SiGoogle,
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    shortLabel: 'IN',
    metricLabel: 'Followers',
    metricField: 'followers',
    accent: '#0a66c2',
    soft: 'rgba(10, 102, 194, 0.12)',
    connectionEnabled: true,
    Icon: FaLinkedinIn,
  },
  twitter: {
    id: 'twitter',
    label: 'X / Twitter',
    shortLabel: 'X',
    metricLabel: 'Followers',
    metricField: 'followers',
    accent: '#111111',
    soft: 'rgba(17, 17, 17, 0.08)',
    connectionEnabled: true,
    Icon: SiX,
  },
}

export const DASHBOARD_PLATFORMS = [
  PLATFORM_CATALOG.instagram,
  PLATFORM_CATALOG.facebook,
  PLATFORM_CATALOG.tiktok,
  PLATFORM_CATALOG.google,
  PLATFORM_CATALOG.linkedin,
  PLATFORM_CATALOG.twitter,
]

export function getPlatformConfig(platformId) {
  return PLATFORM_CATALOG[platformId] || PLATFORM_CATALOG.instagram
}

export function normalizePlatformId(platformId) {
  return platformId === 'x' ? 'twitter' : platformId
}
