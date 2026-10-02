// Standard USA Water Polo age-group eligibility: age on August 1 of the
// TOURNAMENT YEAR itself. This is intentionally separate from
// js/team-age.js, which implements ECA's own domestic season-placement
// rule (age on August 1 of the year AFTER the season starts) -- the two
// answer different questions and should never be conflated.
//
// Both the chart and the calculator on age-division-calculator.html call
// into this one module, so they can never disagree with each other.
(function (global) {
  var DIVISIONS = [
    { name: "10U", minAge: null, maxAge: 10 },
    { name: "12U", minAge: 11, maxAge: 12 },
    { name: "14U", minAge: 13, maxAge: 14 },
    { name: "16U", minAge: 15, maxAge: 16 },
    { name: "18U", minAge: 17, maxAge: 18 },
  ];

  function augustFirst(tournamentYear) {
    return new Date(tournamentYear, 7, 1);
  }

  // Age on August 1 of tournamentYear. A birthday ON August 1 counts as
  // already had -- someone turning 15 that day is 15, not 14.
  function ageOnAugustFirst(dob, tournamentYear) {
    var cutoff = augustFirst(tournamentYear);
    var age = cutoff.getFullYear() - dob.getFullYear();
    var hadBirthdayByCutoff =
      cutoff.getMonth() > dob.getMonth() ||
      (cutoff.getMonth() === dob.getMonth() && cutoff.getDate() >= dob.getDate());
    if (!hadBirthdayByCutoff) age--;
    return age;
  }

  // Null for anyone older than 18U on the cutoff (no standard youth
  // division covers them in this tool).
  function divisionForAge(age) {
    for (var i = 0; i < DIVISIONS.length; i++) {
      var d = DIVISIONS[i];
      if (d.minAge !== null && age < d.minAge) continue;
      if (age <= d.maxAge) return d.name;
    }
    return null;
  }

  function divisionForBirthdate(dob, tournamentYear) {
    var age = ageOnAugustFirst(dob, tournamentYear);
    return { age: age, division: divisionForAge(age) };
  }

  // The calendar-date birth range eligible for a division in a given
  // tournament year -- lets someone read the chart without doing any age
  // math themselves. `latest` is null for 10U, which has no young-end cutoff.
  function divisionBirthdateRange(div, tournamentYear) {
    var earliest = new Date(tournamentYear - div.maxAge - 1, 7, 2); // Aug 2
    var latest = div.minAge !== null ? new Date(tournamentYear - div.minAge, 7, 1) : null; // Aug 1
    return { earliest: earliest, latest: latest };
  }

  global.USWP_AGE_DIVISIONS = DIVISIONS;
  global.uswpAugustFirst = augustFirst;
  global.uswpAgeOnAugustFirst = ageOnAugustFirst;
  global.uswpDivisionForAge = divisionForAge;
  global.uswpDivisionForBirthdate = divisionForBirthdate;
  global.uswpDivisionBirthdateRange = divisionBirthdateRange;
})(window);
