export interface WildlingCard {
    id: string;
    name: string;
    lowestBidderText: string;
    everyoneElseText: string;
    highestBidderText: string;
}

export const WILDLING_DECK: WildlingCard[] = [
    {
        id: 'king-beyond-wall',
        name: 'A King Beyond the Wall',
        lowestBidderText: 'Moves his tokens to the lowest position of every Influence track.',
        everyoneElseText: "In turn order, each player chooses either the Fiefdoms or King's Court Influence track and moves his token to the lowest position of that track.",
        highestBidderText: 'Moves his token to the top of one Influence track of his choice, then takes the appropriate Dominance token.'
    },
    {
        id: 'crow-killers',
        name: 'Crow Killers',
        lowestBidderText: 'Replaces all of his Knights with available Footmen. Any Knight unable to be replaced is destroyed.',
        everyoneElseText: 'Replaces 2 of their Knights with available Footmen. Any Knight unable to be replaced is destroyed.',
        highestBidderText: 'May immediately replace up to 2 of his Footmen, anywhere, with available Knights.'
    },
    {
        id: 'mammoth-riders',
        name: 'Mammoth Riders',
        lowestBidderText: 'Destroys 3 of his units anywhere.',
        everyoneElseText: 'Destroys 2 of their units anywhere.',
        highestBidderText: 'May retrieve 1 House card of his choice from his House card discard pile.'
    },
    {
        id: 'massing-milkwater',
        name: 'Massing on the Milkwater',
        lowestBidderText: 'If he has more than one House card in his hand, he discards all cards with the highest combat strength.',
        everyoneElseText: 'If they have more than one House card in their hand, they must choose and discard one of those cards.',
        highestBidderText: 'Returns his entire House card discard pile into his hand.'
    },
    {
        id: 'preemptive-raid',
        name: 'Preemptive Raid',
        lowestBidderText: 'Choose one of the following: A. Destroys 2 of his units anywhere. B. Is reduced 2 positions on his highest Influence track.',
        everyoneElseText: 'Nothing happens.',
        highestBidderText: 'The wildlings immediately attack again with a strength of 6. You do not participate in the bidding against this attack.'
    },
    {
        id: 'rattleshirts-raiders',
        name: "Rattleshirt's Raiders",
        lowestBidderText: 'Is reduced 2 positions on the Supply track (to no lower than 0).',
        everyoneElseText: 'Is reduced 1 position on the Supply track (to no lower than 0). Then reconcile armies to their new supply limits.',
        highestBidderText: 'Is increased 1 position on the Supply track (to no higher than 6).'
    },
    {
        id: 'silence-at-wall',
        name: 'Silence at the Wall',
        lowestBidderText: 'Nothing happens.',
        everyoneElseText: 'Nothing happens.',
        highestBidderText: 'Nothing happens.'
    },
    {
        id: 'skinchanger-scout',
        name: 'Skinchanger Scout',
        lowestBidderText: 'Discards all available Power tokens.',
        everyoneElseText: 'Discards 2 available Power tokens, or as many as they are able.',
        highestBidderText: 'All Power tokens he bid on this attack are immediately returned to his available Power.'
    },
    {
        id: 'horde-descends',
        name: 'The Horde Descends',
        lowestBidderText: 'Destroys 2 of his units at one of his Castles or Strongholds. If unable, he destroys 2 of his units anywhere.',
        everyoneElseText: 'Destroys 1 of their units anywhere.',
        highestBidderText: 'May muster forces (following normal mustering rules) in any one Castle or Stronghold area he controls.'
    }
];
