import type { RatingTheme } from '@rranker/sdk';

export const NEUTRAL_RATING_THEME: RatingTheme = {
  id: 'empty', label: 'empty',
  fillColors: ['#2A3140', '#1A1F2A'], fillLocations: [0, 1],
  borderColors: ['#596273', '#303745'], borderLocations: [0, 1],
  overlayColor: 'transparent', textColor: '#FFFFFF', starColor: '#CBD5E1', starCount: 0,
};

const TWO_STOPS = [0, 1] as const;

const THREE_STOPS = [0, 0.52, 1] as const;

export const RATING_PALETTES = {
white: { fillColors: ['#FFFFFF', '#EBEFF2', '#DBE1E5'], fillLocations: [0, 0.5, 1], borderColors: ['#929BA1', '#687178'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.08)', textColor: '#303136', starColor: '#5B6167' },
blue: { fillColors: ['#96DCED', '#76C5DF', '#65AECF'], fillLocations: THREE_STOPS, borderColors: ['#2A6B83', '#1D536D'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#2B3940', starColor: '#3D5660' },
green: { fillColors: ['#ABDF92', '#8ACB7A', '#70B76A'], fillLocations: THREE_STOPS, borderColors: ['#3C7B3B', '#2B6332'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#2D3B2E', starColor: '#446046' },
yellow: { fillColors: ['#F4DF81', '#E9C95C', '#DCA943'], fillLocations: THREE_STOPS, borderColors: ['#8B711C', '#765217'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#453C18', starColor: '#655722' },
red: { fillColors: ['#F0A6AC', '#DF7F8A', '#CE6475'], fillLocations: THREE_STOPS, borderColors: ['#893545', '#712738'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#452A30', starColor: '#684047' },
purple: { fillColors: ['#CFABDD', '#B68ACA', '#9F70B8'], fillLocations: THREE_STOPS, borderColors: ['#6A4679', '#523761'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#3D2D43', starColor: '#60476A' },
bronze: { fillColors: ['#D4A07C', '#BB7E57', '#A36245'], fillLocations: THREE_STOPS, borderColors: ['#73432D', '#592F23'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#412D25', starColor: '#624236' },
silver: { fillColors: ['#D7E2E8', '#BCCDD4', '#A2B3BC'], fillLocations: THREE_STOPS, borderColors: ['#677B85', '#4F626D'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#38464D', starColor: '#56666F' },
gold: { fillColors: ['#F4DF86', '#E8BF49', '#D5972C'], fillLocations: THREE_STOPS, borderColors: ['#93711B', '#724A10'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.14)', textColor: '#473813', starColor: '#7A5A16' },
platinum: { fillColors: ['#FFF9EC', '#F1DDB1', '#FFF8E9', '#F5E9CC'], fillLocations: [0, 0.45, 0.72, 1], borderColors: ['#D9BC7F', '#B99A55'], borderLocations: TWO_STOPS, overlayColor: 'rgba(75,78,85,0.10)', textColor: '#4A3B1E', starColor: '#9A7B35' },
rainbow: { fillColors: ['#FF9CA8', '#FFC07E', '#EADB72', '#88CF96', '#79BFDB', '#9199DC', '#C28BD4'], fillLocations: [0, 0.16, 0.32, 0.48, 0.64, 0.8, 1], borderColors: ['#8E2437', '#984D19', '#796515', '#256B39', '#205E7A', '#384181', '#692C7C'], borderLocations: [0, 0.16, 0.32, 0.48, 0.64, 0.8, 1], overlayColor: 'rgba(75,78,85,0.16)', textColor: '#303136', starColor: '#65527A' },
extreme: { fillColors: ['#FFFEFD', '#F8FBFF', '#EFFBFF', '#F6F1FF', '#FFF7FB'], fillLocations: [0, 0.22, 0.44, 0.68, 1], borderColors: ['#67D9FF', '#7FA9FF', '#B995FF', '#EC8DCF', '#FFB0BF'], borderLocations: [0, 0.24, 0.52, 0.78, 1], overlayColor: 'rgba(255,255,255,0.12)', textColor: '#3C4450', starColor: '#8B79C8' }
} satisfies Record<string, Omit<RatingTheme, 'id' | 'label' | 'starCount'>>;
