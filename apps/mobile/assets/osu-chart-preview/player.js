/*!
rRanker osu! chart preview
replayviewer-js: https://github.com/daladal/replayviewer-js/tree/a8e5d93210188a6bfb3a0181419df0cf1e9675e7
Includes osu! ruleset adaptations and danser-go rendering adaptations.
Modifications by rRanker, 2026-09-19: native resource integration, fixed-speed playback, audio scheduling, flat skin and rendering controls.
GPL-covered portions retain GPLv3 terms within the AGPLv3 combination.
Corresponding source and build scripts: https://github.com/kckc7887/rRanker

LICENSE

GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU Affero General Public License is a free, copyleft license for
software and other kinds of works, specifically designed to ensure
cooperation with the community in the case of network server software.

  The licenses for most software and other practical works are designed
to take away your freedom to share and change the works.  By contrast,
our General Public Licenses are intended to guarantee your freedom to
share and change all versions of a program--to make sure it remains free
software for all its users.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
them if you wish), that you receive source code or can get it if you
want it, that you can change the software or use pieces of it in new
free programs, and that you know you can do these things.

  Developers that use our General Public Licenses protect your rights
with two steps: (1) assert copyright on the software, and (2) offer
you this License which gives you legal permission to copy, distribute
and/or modify the software.

  A secondary benefit of defending all users' freedom is that
improvements made in alternate versions of the program, if they
receive widespread use, become available for other developers to
incorporate.  Many developers of free software are heartened and
encouraged by the resulting cooperation.  However, in the case of
software used on network servers, this result may fail to come about.
The GNU General Public License permits making a modified version and
letting the public access it on a server without ever releasing its
source code to the public.

  The GNU Affero General Public License is designed specifically to
ensure that, in such cases, the modified source code becomes available
to the community.  It requires the operator of a network server to
provide the source code of the modified version running there to the
users of that server.  Therefore, public use of a modified version, on
a publicly accessible server, gives the public access to the source
code of the modified version.

  An older license, called the Affero General Public License and
published by Affero, was designed to accomplish similar goals.  This is
a different license, not a version of the Affero GPL, but Affero has
released a new version of the Affero GPL which permits relicensing under
this license.

  The precise terms and conditions for copying, distribution and
modification follow.

                       TERMS AND CONDITIONS

  0. Definitions.

  "This License" refers to version 3 of the GNU Affero General Public License.

  "Copyright" also means copyright-like laws that apply to other kinds of
works, such as semiconductor masks.

  "The Program" refers to any copyrightable work licensed under this
License.  Each licensee is addressed as "you".  "Licensees" and
"recipients" may be individuals or organizations.

  To "modify" a work means to copy from or adapt all or part of the work
in a fashion requiring copyright permission, other than the making of an
exact copy.  The resulting work is called a "modified version" of the
earlier work or a work "based on" the earlier work.

  A "covered work" means either the unmodified Program or a work based
on the Program.

  To "propagate" a work means to do anything with it that, without
permission, would make you directly or secondarily liable for
infringement under applicable copyright law, except executing it on a
computer or modifying a private copy.  Propagation includes copying,
distribution (with or without modification), making available to the
public, and in some countries other activities as well.

  To "convey" a work means any kind of propagation that enables other
parties to make or receive copies.  Mere interaction with a user through
a computer network, with no transfer of a copy, is not conveying.

  An interactive user interface displays "Appropriate Legal Notices"
to the extent that it includes a convenient and prominently visible
feature that (1) displays an appropriate copyright notice, and (2)
tells the user that there is no warranty for the work (except to the
extent that warranties are provided), that licensees may convey the
work under this License, and how to view a copy of this License.  If
the interface presents a list of user commands or options, such as a
menu, a prominent item in the list meets this criterion.

  1. Source Code.

  The "source code" for a work means the preferred form of the work
for making modifications to it.  "Object code" means any non-source
form of a work.

  A "Standard Interface" means an interface that either is an official
standard defined by a recognized standards body, or, in the case of
interfaces specified for a particular programming language, one that
is widely used among developers working in that language.

  The "System Libraries" of an executable work include anything, other
than the work as a whole, that (a) is included in the normal form of
packaging a Major Component, but which is not part of that Major
Component, and (b) serves only to enable use of the work with that
Major Component, or to implement a Standard Interface for which an
implementation is available to the public in source code form.  A
"Major Component", in this context, means a major essential component
(kernel, window system, and so on) of the specific operating system
(if any) on which the executable work runs, or a compiler used to
produce the work, or an object code interpreter used to run it.

  The "Corresponding Source" for a work in object code form means all
the source code needed to generate, install, and (for an executable
work) run the object code and to modify the work, including scripts to
control those activities.  However, it does not include the work's
System Libraries, or general-purpose tools or generally available free
programs which are used unmodified in performing those activities but
which are not part of the work.  For example, Corresponding Source
includes interface definition files associated with source files for
the work, and the source code for shared libraries and dynamically
linked subprograms that the work is specifically designed to require,
such as by intimate data communication or control flow between those
subprograms and other parts of the work.

  The Corresponding Source need not include anything that users
can regenerate automatically from other parts of the Corresponding
Source.

  The Corresponding Source for a work in source code form is that
same work.

  2. Basic Permissions.

  All rights granted under this License are granted for the term of
copyright on the Program, and are irrevocable provided the stated
conditions are met.  This License explicitly affirms your unlimited
permission to run the unmodified Program.  The output from running a
covered work is covered by this License only if the output, given its
content, constitutes a covered work.  This License acknowledges your
rights of fair use or other equivalent, as provided by copyright law.

  You may make, run and propagate covered works that you do not
convey, without conditions so long as your license otherwise remains
in force.  You may convey covered works to others for the sole purpose
of having them make modifications exclusively for you, or provide you
with facilities for running those works, provided that you comply with
the terms of this License in conveying all material for which you do
not control copyright.  Those thus making or running the covered works
for you must do so exclusively on your behalf, under your direction
and control, on terms that prohibit them from making any copies of
your copyrighted material outside their relationship with you.

  Conveying under any other circumstances is permitted solely under
the conditions stated below.  Sublicensing is not allowed; section 10
makes it unnecessary.

  3. Protecting Users' Legal Rights From Anti-Circumvention Law.

  No covered work shall be deemed part of an effective technological
measure under any applicable law fulfilling obligations under article
11 of the WIPO copyright treaty adopted on 20 December 1996, or
similar laws prohibiting or restricting circumvention of such
measures.

  When you convey a covered work, you waive any legal power to forbid
circumvention of technological measures to the extent such circumvention
is effected by exercising rights under this License with respect to
the covered work, and you disclaim any intention to limit operation or
modification of the work as a means of enforcing, against the work's
users, your or third parties' legal rights to forbid circumvention of
technological measures.

  4. Conveying Verbatim Copies.

  You may convey verbatim copies of the Program's source code as you
receive it, in any medium, provided that you conspicuously and
appropriately publish on each copy an appropriate copyright notice;
keep intact all notices stating that this License and any
non-permissive terms added in accord with section 7 apply to the code;
keep intact all notices of the absence of any warranty; and give all
recipients a copy of this License along with the Program.

  You may charge any price or no price for each copy that you convey,
and you may offer support or warranty protection for a fee.

  5. Conveying Modified Source Versions.

  You may convey a work based on the Program, or the modifications to
produce it from the Program, in the form of source code under the
terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified
    it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is
    released under this License and any conditions added under section
    7.  This requirement modifies the requirement in section 4 to
    "keep intact all notices".

    c) You must license the entire work, as a whole, under this
    License to anyone who comes into possession of a copy.  This
    License will therefore apply, along with any applicable section 7
    additional terms, to the whole of the work, and all its parts,
    regardless of how they are packaged.  This License gives no
    permission to license the work in any other way, but it does not
    invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display
    Appropriate Legal Notices; however, if the Program has interactive
    interfaces that do not display Appropriate Legal Notices, your
    work need not make them do so.

  A compilation of a covered work with other separate and independent
works, which are not by their nature extensions of the covered work,
and which are not combined with it such as to form a larger program,
in or on a volume of a storage or distribution medium, is called an
"aggregate" if the compilation and its resulting copyright are not
used to limit the access or legal rights of the compilation's users
beyond what the individual works permit.  Inclusion of a covered work
in an aggregate does not cause this License to apply to the other
parts of the aggregate.

  6. Conveying Non-Source Forms.

  You may convey a covered work in object code form under the terms
of sections 4 and 5, provided that you also convey the
machine-readable Corresponding Source under the terms of this License,
in one of these ways:

    a) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by the
    Corresponding Source fixed on a durable physical medium
    customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by a
    written offer, valid for at least three years and valid for as
    long as you offer spare parts or customer support for that product
    model, to give anyone who possesses the object code either (1) a
    copy of the Corresponding Source for all the software in the
    product that is covered by this License, on a durable physical
    medium customarily used for software interchange, for a price no
    more than your reasonable cost of physically performing this
    conveying of source, or (2) access to copy the
    Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the
    written offer to provide the Corresponding Source.  This
    alternative is allowed only occasionally and noncommercially, and
    only if you received the object code with such an offer, in accord
    with subsection 6b.

    d) Convey the object code by offering access from a designated
    place (gratis or for a charge), and offer equivalent access to the
    Corresponding Source in the same way through the same place at no
    further charge.  You need not require recipients to copy the
    Corresponding Source along with the object code.  If the place to
    copy the object code is a network server, the Corresponding Source
    may be on a different server (operated by you or a third party)
    that supports equivalent copying facilities, provided you maintain
    clear directions next to the object code saying where to find the
    Corresponding Source.  Regardless of what server hosts the
    Corresponding Source, you remain obligated to ensure that it is
    available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided
    you inform other peers where the object code and Corresponding
    Source of the work are being offered to the general public at no
    charge under subsection 6d.

  A separable portion of the object code, whose source code is excluded
from the Corresponding Source as a System Library, need not be
included in conveying the object code work.

  A "User Product" is either (1) a "consumer product", which means any
tangible personal property which is normally used for personal, family,
or household purposes, or (2) anything designed or sold for incorporation
into a dwelling.  In determining whether a product is a consumer product,
doubtful cases shall be resolved in favor of coverage.  For a particular
product received by a particular user, "normally used" refers to a
typical or common use of that class of product, regardless of the status
of the particular user or of the way in which the particular user
actually uses, or expects or is expected to use, the product.  A product
is a consumer product regardless of whether the product has substantial
commercial, industrial or non-consumer uses, unless such uses represent
the only significant mode of use of the product.

  "Installation Information" for a User Product means any methods,
procedures, authorization keys, or other information required to install
and execute modified versions of a covered work in that User Product from
a modified version of its Corresponding Source.  The information must
suffice to ensure that the continued functioning of the modified object
code is in no case prevented or interfered with solely because
modification has been made.

  If you convey an object code work under this section in, or with, or
specifically for use in, a User Product, and the conveying occurs as
part of a transaction in which the right of possession and use of the
User Product is transferred to the recipient in perpetuity or for a
fixed term (regardless of how the transaction is characterized), the
Corresponding Source conveyed under this section must be accompanied
by the Installation Information.  But this requirement does not apply
if neither you nor any third party retains the ability to install
modified object code on the User Product (for example, the work has
been installed in ROM).

  The requirement to provide Installation Information does not include a
requirement to continue to provide support service, warranty, or updates
for a work that has been modified or installed by the recipient, or for
the User Product in which it has been modified or installed.  Access to a
network may be denied when the modification itself materially and
adversely affects the operation of the network or violates the rules and
protocols for communication across the network.

  Corresponding Source conveyed, and Installation Information provided,
in accord with this section must be in a format that is publicly
documented (and with an implementation available to the public in
source code form), and must require no special password or key for
unpacking, reading or copying.

  7. Additional Terms.

  "Additional permissions" are terms that supplement the terms of this
License by making exceptions from one or more of its conditions.
Additional permissions that are applicable to the entire Program shall
be treated as though they were included in this License, to the extent
that they are valid under applicable law.  If additional permissions
apply only to part of the Program, that part may be used separately
under those permissions, but the entire Program remains governed by
this License without regard to the additional permissions.

  When you convey a copy of a covered work, you may at your option
remove any additional permissions from that copy, or from any part of
it.  (Additional permissions may be written to require their own
removal in certain cases when you modify the work.)  You may place
additional permissions on material, added by you to a covered work,
for which you have or can give appropriate copyright permission.

  Notwithstanding any other provision of this License, for material you
add to a covered work, you may (if authorized by the copyright holders of
that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the
    terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or
    author attributions in that material or in the Appropriate Legal
    Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or
    requiring that modified versions of such material be marked in
    reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or
    authors of the material; or

    e) Declining to grant rights under trademark law for use of some
    trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that
    material by anyone who conveys the material (or modified versions of
    it) with contractual assumptions of liability to the recipient, for
    any liability that these contractual assumptions directly impose on
    those licensors and authors.

  All other non-permissive additional terms are considered "further
restrictions" within the meaning of section 10.  If the Program as you
received it, or any part of it, contains a notice stating that it is
governed by this License along with a term that is a further
restriction, you may remove that term.  If a license document contains
a further restriction but permits relicensing or conveying under this
License, you may add to a covered work material governed by the terms
of that license document, provided that the further restriction does
not survive such relicensing or conveying.

  If you add terms to a covered work in accord with this section, you
must place, in the relevant source files, a statement of the
additional terms that apply to those files, or a notice indicating
where to find the applicable terms.

  Additional terms, permissive or non-permissive, may be stated in the
form of a separately written license, or stated as exceptions;
the above requirements apply either way.

  8. Termination.

  You may not propagate or modify a covered work except as expressly
provided under this License.  Any attempt otherwise to propagate or
modify it is void, and will automatically terminate your rights under
this License (including any patent licenses granted under the third
paragraph of section 11).

  However, if you cease all violation of this License, then your
license from a particular copyright holder is reinstated (a)
provisionally, unless and until the copyright holder explicitly and
finally terminates your license, and (b) permanently, if the copyright
holder fails to notify you of the violation by some reasonable means
prior to 60 days after the cessation.

  Moreover, your license from a particular copyright holder is
reinstated permanently if the copyright holder notifies you of the
violation by some reasonable means, this is the first time you have
received notice of violation of this License (for any work) from that
copyright holder, and you cure the violation prior to 30 days after
your receipt of the notice.

  Termination of your rights under this section does not terminate the
licenses of parties who have received copies or rights from you under
this License.  If your rights have been terminated and not permanently
reinstated, you do not qualify to receive new licenses for the same
material under section 10.

  9. Acceptance Not Required for Having Copies.

  You are not required to accept this License in order to receive or
run a copy of the Program.  Ancillary propagation of a covered work
occurring solely as a consequence of using peer-to-peer transmission
to receive a copy likewise does not require acceptance.  However,
nothing other than this License grants you permission to propagate or
modify any covered work.  These actions infringe copyright if you do
not accept this License.  Therefore, by modifying or propagating a
covered work, you indicate your acceptance of this License to do so.

  10. Automatic Licensing of Downstream Recipients.

  Each time you convey a covered work, the recipient automatically
receives a license from the original licensors, to run, modify and
propagate that work, subject to this License.  You are not responsible
for enforcing compliance by third parties with this License.

  An "entity transaction" is a transaction transferring control of an
organization, or substantially all assets of one, or subdividing an
organization, or merging organizations.  If propagation of a covered
work results from an entity transaction, each party to that
transaction who receives a copy of the work also receives whatever
licenses to the work the party's predecessor in interest had or could
give under the previous paragraph, plus a right to possession of the
Corresponding Source of the work from the predecessor in interest, if
the predecessor has it or can get it with reasonable efforts.

  You may not impose any further restrictions on the exercise of the
rights granted or affirmed under this License.  For example, you may
not impose a license fee, royalty, or other charge for exercise of
rights granted under this License, and you may not initiate litigation
(including a cross-claim or counterclaim in a lawsuit) alleging that
any patent claim is infringed by making, using, selling, offering for
sale, or importing the Program or any portion of it.

  11. Patents.

  A "contributor" is a copyright holder who authorizes use under this
License of the Program or a work on which the Program is based.  The
work thus licensed is called the contributor's "contributor version".

  A contributor's "essential patent claims" are all patent claims
owned or controlled by the contributor, whether already acquired or
hereafter acquired, that would be infringed by some manner, permitted
by this License, of making, using, or selling its contributor version,
but do not include claims that would be infringed only as a
consequence of further modification of the contributor version.  For
purposes of this definition, "control" includes the right to grant
patent sublicenses in a manner consistent with the requirements of
this License.

  Each contributor grants you a non-exclusive, worldwide, royalty-free
patent license under the contributor's essential patent claims, to
make, use, sell, offer for sale, import and otherwise run, modify and
propagate the contents of its contributor version.

  In the following three paragraphs, a "patent license" is any express
agreement or commitment, however denominated, not to enforce a patent
(such as an express permission to practice a patent or covenant not to
sue for patent infringement).  To "grant" such a patent license to a
party means to make such an agreement or commitment not to enforce a
patent against the party.

  If you convey a covered work, knowingly relying on a patent license,
and the Corresponding Source of the work is not available for anyone
to copy, free of charge and under the terms of this License, through a
publicly available network server or other readily accessible means,
then you must either (1) cause the Corresponding Source to be so
available, or (2) arrange to deprive yourself of the benefit of the
patent license for this particular work, or (3) arrange, in a manner
consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have
actual knowledge that, but for the patent license, your conveying the
covered work in a country, or your recipient's use of the covered work
in a country, would infringe one or more identifiable patents in that
country that you have reason to believe are valid.

  If, pursuant to or in connection with a single transaction or
arrangement, you convey, or propagate by procuring conveyance of, a
covered work, and grant a patent license to some of the parties
receiving the covered work authorizing them to use, propagate, modify
or convey a specific copy of the covered work, then the patent license
you grant is automatically extended to all recipients of the covered
work and works based on it.

  A patent license is "discriminatory" if it does not include within
the scope of its coverage, prohibits the exercise of, or is
conditioned on the non-exercise of one or more of the rights that are
specifically granted under this License.  You may not convey a covered
work if you are a party to an arrangement with a third party that is
in the business of distributing software, under which you make payment
to the third party based on the extent of your activity of conveying
the work, and under which the third party grants, to any of the
parties who would receive the covered work from you, a discriminatory
patent license (a) in connection with copies of the covered work
conveyed by you (or copies made from those copies), or (b) primarily
for and in connection with specific products or compilations that
contain the covered work, unless you entered into that arrangement,
or that patent license was granted, prior to 28 March 2007.

  Nothing in this License shall be construed as excluding or limiting
any implied license or other defenses to infringement that may
otherwise be available to you under applicable patent law.

  12. No Surrender of Others' Freedom.

  If conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot convey a
covered work so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you
to collect a royalty for further conveying from those to whom you convey
the Program, the only way you could satisfy both those terms and this
License would be to refrain entirely from conveying the Program.

  13. Remote Network Interaction; Use with the GNU General Public License.

  Notwithstanding any other provision of this License, if you modify the
Program, your modified version must prominently offer all users
interacting with it remotely through a computer network (if your version
supports such interaction) an opportunity to receive the Corresponding
Source of your version by providing access to the Corresponding Source
from a network server at no charge, through some standard or customary
means of facilitating copying of software.  This Corresponding Source
shall include the Corresponding Source for any work covered by version 3
of the GNU General Public License that is incorporated pursuant to the
following paragraph.

  Notwithstanding any other provision of this License, you have
permission to link or combine any covered work with a work licensed
under version 3 of the GNU General Public License into a single
combined work, and to convey the resulting work.  The terms of this
License will continue to apply to the part which is the covered work,
but the work with which it is combined will remain governed by version
3 of the GNU General Public License.

  14. Revised Versions of this License.

  The Free Software Foundation may publish revised and/or new versions of
the GNU Affero General Public License from time to time.  Such new versions
will be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

  Each version is given a distinguishing version number.  If the
Program specifies that a certain numbered version of the GNU Affero General
Public License "or any later version" applies to it, you have the
option of following the terms and conditions either of that numbered
version or of any later version published by the Free Software
Foundation.  If the Program does not specify a version number of the
GNU Affero General Public License, you may choose any version ever published
by the Free Software Foundation.

  If the Program specifies that a proxy can decide which future
versions of the GNU Affero General Public License can be used, that proxy's
public statement of acceptance of a version permanently authorizes you
to choose that version for the Program.

  Later license versions may give you additional or different
permissions.  However, no additional obligations are imposed on any
author or copyright holder as a result of your choosing to follow a
later version.

  15. Disclaimer of Warranty.

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. Limitation of Liability.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

  17. Interpretation of Sections 15 and 16.

  If the disclaimer of warranty and limitation of liability provided
above cannot be given local legal effect according to their terms,
reviewing courts shall apply local law that most closely approximates
an absolute waiver of all civil liability in connection with the
Program, unless a warranty or assumption of liability accompanies a
copy of the Program in return for a fee.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
state the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    rRanker is a rhythm game data management application.
    Copyright (C) 2026 尘言 潁川ホコリ

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

  If your software can interact with users remotely through a computer
network, you should also make sure that it provides a way for users to
get its source.  For example, if your program is a web application, its
interface could display a "Source" link that leads users to an archive
of the code.  There are many ways you could offer source, and different
solutions will be better for different programs; see section 13 for the
specific requirements.

  You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary.
For more information on this, and how to apply and follow the GNU AGPL, see
<https://www.gnu.org/licenses/>.

----------------------------------------

LICENSES/replayviewer-js-MIT.txt

MIT License

Copyright (c) 2026 bog

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

----------------------------------------

LICENSES/danser-go-GPL-3.0.txt

Copyright (c) 2018-2024 Sebastian Krajewski (mail@wieku.me)

Majority of danser-go project, unless stated otherwise (for example assets
mentioned in CREDITS.md file), is released under the following license:

                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU General Public License is a free, copyleft license for
software and other kinds of works.

  The licenses for most software and other practical works are designed
to take away your freedom to share and change the works.  By contrast,
the GNU General Public License is intended to guarantee your freedom to
share and change all versions of a program--to make sure it remains free
software for all its users.  We, the Free Software Foundation, use the
GNU General Public License for most of our software; it applies also to
any other work released this way by its authors.  You can apply it to
your programs, too.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
them if you wish), that you receive source code or can get it if you
want it, that you can change the software or use pieces of it in new
free programs, and that you know you can do these things.

  To protect your rights, we need to prevent others from denying you
these rights or asking you to surrender the rights.  Therefore, you have
certain responsibilities if you distribute copies of the software, or if
you modify it: responsibilities to respect the freedom of others.

  For example, if you distribute copies of such a program, whether
gratis or for a fee, you must pass on to the recipients the same
freedoms that you received.  You must make sure that they, too, receive
or can get the source code.  And you must show them these terms so they
know their rights.

  Developers that use the GNU GPL protect your rights with two steps:
(1) assert copyright on the software, and (2) offer you this License
giving you legal permission to copy, distribute and/or modify it.

  For the developers' and authors' protection, the GPL clearly explains
that there is no warranty for this free software.  For both users' and
authors' sake, the GPL requires that modified versions be marked as
changed, so that their problems will not be attributed erroneously to
authors of previous versions.

  Some devices are designed to deny users access to install or run
modified versions of the software inside them, although the manufacturer
can do so.  This is fundamentally incompatible with the aim of
protecting users' freedom to change the software.  The systematic
pattern of such abuse occurs in the area of products for individuals to
use, which is precisely where it is most unacceptable.  Therefore, we
have designed this version of the GPL to prohibit the practice for those
products.  If such problems arise substantially in other domains, we
stand ready to extend this provision to those domains in future versions
of the GPL, as needed to protect the freedom of users.

  Finally, every program is threatened constantly by software patents.
States should not allow patents to restrict development and use of
software on general-purpose computers, but in those that do, we wish to
avoid the special danger that patents applied to a free program could
make it effectively proprietary.  To prevent this, the GPL assures that
patents cannot be used to render the program non-free.

  The precise terms and conditions for copying, distribution and
modification follow.

                       TERMS AND CONDITIONS

  0. Definitions.

  "This License" refers to version 3 of the GNU General Public License.

  "Copyright" also means copyright-like laws that apply to other kinds of
works, such as semiconductor masks.

  "The Program" refers to any copyrightable work licensed under this
License.  Each licensee is addressed as "you".  "Licensees" and
"recipients" may be individuals or organizations.

  To "modify" a work means to copy from or adapt all or part of the work
in a fashion requiring copyright permission, other than the making of an
exact copy.  The resulting work is called a "modified version" of the
earlier work or a work "based on" the earlier work.

  A "covered work" means either the unmodified Program or a work based
on the Program.

  To "propagate" a work means to do anything with it that, without
permission, would make you directly or secondarily liable for
infringement under applicable copyright law, except executing it on a
computer or modifying a private copy.  Propagation includes copying,
distribution (with or without modification), making available to the
public, and in some countries other activities as well.

  To "convey" a work means any kind of propagation that enables other
parties to make or receive copies.  Mere interaction with a user through
a computer network, with no transfer of a copy, is not conveying.

  An interactive user interface displays "Appropriate Legal Notices"
to the extent that it includes a convenient and prominently visible
feature that (1) displays an appropriate copyright notice, and (2)
tells the user that there is no warranty for the work (except to the
extent that warranties are provided), that licensees may convey the
work under this License, and how to view a copy of this License.  If
the interface presents a list of user commands or options, such as a
menu, a prominent item in the list meets this criterion.

  1. Source Code.

  The "source code" for a work means the preferred form of the work
for making modifications to it.  "Object code" means any non-source
form of a work.

  A "Standard Interface" means an interface that either is an official
standard defined by a recognized standards body, or, in the case of
interfaces specified for a particular programming language, one that
is widely used among developers working in that language.

  The "System Libraries" of an executable work include anything, other
than the work as a whole, that (a) is included in the normal form of
packaging a Major Component, but which is not part of that Major
Component, and (b) serves only to enable use of the work with that
Major Component, or to implement a Standard Interface for which an
implementation is available to the public in source code form.  A
"Major Component", in this context, means a major essential component
(kernel, window system, and so on) of the specific operating system
(if any) on which the executable work runs, or a compiler used to
produce the work, or an object code interpreter used to run it.

  The "Corresponding Source" for a work in object code form means all
the source code needed to generate, install, and (for an executable
work) run the object code and to modify the work, including scripts to
control those activities.  However, it does not include the work's
System Libraries, or general-purpose tools or generally available free
programs which are used unmodified in performing those activities but
which are not part of the work.  For example, Corresponding Source
includes interface definition files associated with source files for
the work, and the source code for shared libraries and dynamically
linked subprograms that the work is specifically designed to require,
such as by intimate data communication or control flow between those
subprograms and other parts of the work.

  The Corresponding Source need not include anything that users
can regenerate automatically from other parts of the Corresponding
Source.

  The Corresponding Source for a work in source code form is that
same work.

  2. Basic Permissions.

  All rights granted under this License are granted for the term of
copyright on the Program, and are irrevocable provided the stated
conditions are met.  This License explicitly affirms your unlimited
permission to run the unmodified Program.  The output from running a
covered work is covered by this License only if the output, given its
content, constitutes a covered work.  This License acknowledges your
rights of fair use or other equivalent, as provided by copyright law.

  You may make, run and propagate covered works that you do not
convey, without conditions so long as your license otherwise remains
in force.  You may convey covered works to others for the sole purpose
of having them make modifications exclusively for you, or provide you
with facilities for running those works, provided that you comply with
the terms of this License in conveying all material for which you do
not control copyright.  Those thus making or running the covered works
for you must do so exclusively on your behalf, under your direction
and control, on terms that prohibit them from making any copies of
your copyrighted material outside their relationship with you.

  Conveying under any other circumstances is permitted solely under
the conditions stated below.  Sublicensing is not allowed; section 10
makes it unnecessary.

  3. Protecting Users' Legal Rights From Anti-Circumvention Law.

  No covered work shall be deemed part of an effective technological
measure under any applicable law fulfilling obligations under article
11 of the WIPO copyright treaty adopted on 20 December 1996, or
similar laws prohibiting or restricting circumvention of such
measures.

  When you convey a covered work, you waive any legal power to forbid
circumvention of technological measures to the extent such circumvention
is effected by exercising rights under this License with respect to
the covered work, and you disclaim any intention to limit operation or
modification of the work as a means of enforcing, against the work's
users, your or third parties' legal rights to forbid circumvention of
technological measures.

  4. Conveying Verbatim Copies.

  You may convey verbatim copies of the Program's source code as you
receive it, in any medium, provided that you conspicuously and
appropriately publish on each copy an appropriate copyright notice;
keep intact all notices stating that this License and any
non-permissive terms added in accord with section 7 apply to the code;
keep intact all notices of the absence of any warranty; and give all
recipients a copy of this License along with the Program.

  You may charge any price or no price for each copy that you convey,
and you may offer support or warranty protection for a fee.

  5. Conveying Modified Source Versions.

  You may convey a work based on the Program, or the modifications to
produce it from the Program, in the form of source code under the
terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified
    it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is
    released under this License and any conditions added under section
    7.  This requirement modifies the requirement in section 4 to
    "keep intact all notices".

    c) You must license the entire work, as a whole, under this
    License to anyone who comes into possession of a copy.  This
    License will therefore apply, along with any applicable section 7
    additional terms, to the whole of the work, and all its parts,
    regardless of how they are packaged.  This License gives no
    permission to license the work in any other way, but it does not
    invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display
    Appropriate Legal Notices; however, if the Program has interactive
    interfaces that do not display Appropriate Legal Notices, your
    work need not make them do so.

  A compilation of a covered work with other separate and independent
works, which are not by their nature extensions of the covered work,
and which are not combined with it such as to form a larger program,
in or on a volume of a storage or distribution medium, is called an
"aggregate" if the compilation and its resulting copyright are not
used to limit the access or legal rights of the compilation's users
beyond what the individual works permit.  Inclusion of a covered work
in an aggregate does not cause this License to apply to the other
parts of the aggregate.

  6. Conveying Non-Source Forms.

  You may convey a covered work in object code form under the terms
of sections 4 and 5, provided that you also convey the
machine-readable Corresponding Source under the terms of this License,
in one of these ways:

    a) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by the
    Corresponding Source fixed on a durable physical medium
    customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by a
    written offer, valid for at least three years and valid for as
    long as you offer spare parts or customer support for that product
    model, to give anyone who possesses the object code either (1) a
    copy of the Corresponding Source for all the software in the
    product that is covered by this License, on a durable physical
    medium customarily used for software interchange, for a price no
    more than your reasonable cost of physically performing this
    conveying of source, or (2) access to copy the
    Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the
    written offer to provide the Corresponding Source.  This
    alternative is allowed only occasionally and noncommercially, and
    only if you received the object code with such an offer, in accord
    with subsection 6b.

    d) Convey the object code by offering access from a designated
    place (gratis or for a charge), and offer equivalent access to the
    Corresponding Source in the same way through the same place at no
    further charge.  You need not require recipients to copy the
    Corresponding Source along with the object code.  If the place to
    copy the object code is a network server, the Corresponding Source
    may be on a different server (operated by you or a third party)
    that supports equivalent copying facilities, provided you maintain
    clear directions next to the object code saying where to find the
    Corresponding Source.  Regardless of what server hosts the
    Corresponding Source, you remain obligated to ensure that it is
    available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided
    you inform other peers where the object code and Corresponding
    Source of the work are being offered to the general public at no
    charge under subsection 6d.

  A separable portion of the object code, whose source code is excluded
from the Corresponding Source as a System Library, need not be
included in conveying the object code work.

  A "User Product" is either (1) a "consumer product", which means any
tangible personal property which is normally used for personal, family,
or household purposes, or (2) anything designed or sold for incorporation
into a dwelling.  In determining whether a product is a consumer product,
doubtful cases shall be resolved in favor of coverage.  For a particular
product received by a particular user, "normally used" refers to a
typical or common use of that class of product, regardless of the status
of the particular user or of the way in which the particular user
actually uses, or expects or is expected to use, the product.  A product
is a consumer product regardless of whether the product has substantial
commercial, industrial or non-consumer uses, unless such uses represent
the only significant mode of use of the product.

  "Installation Information" for a User Product means any methods,
procedures, authorization keys, or other information required to install
and execute modified versions of a covered work in that User Product from
a modified version of its Corresponding Source.  The information must
suffice to ensure that the continued functioning of the modified object
code is in no case prevented or interfered with solely because
modification has been made.

  If you convey an object code work under this section in, or with, or
specifically for use in, a User Product, and the conveying occurs as
part of a transaction in which the right of possession and use of the
User Product is transferred to the recipient in perpetuity or for a
fixed term (regardless of how the transaction is characterized), the
Corresponding Source conveyed under this section must be accompanied
by the Installation Information.  But this requirement does not apply
if neither you nor any third party retains the ability to install
modified object code on the User Product (for example, the work has
been installed in ROM).

  The requirement to provide Installation Information does not include a
requirement to continue to provide support service, warranty, or updates
for a work that has been modified or installed by the recipient, or for
the User Product in which it has been modified or installed.  Access to a
network may be denied when the modification itself materially and
adversely affects the operation of the network or violates the rules and
protocols for communication across the network.

  Corresponding Source conveyed, and Installation Information provided,
in accord with this section must be in a format that is publicly
documented (and with an implementation available to the public in
source code form), and must require no special password or key for
unpacking, reading or copying.

  7. Additional Terms.

  "Additional permissions" are terms that supplement the terms of this
License by making exceptions from one or more of its conditions.
Additional permissions that are applicable to the entire Program shall
be treated as though they were included in this License, to the extent
that they are valid under applicable law.  If additional permissions
apply only to part of the Program, that part may be used separately
under those permissions, but the entire Program remains governed by
this License without regard to the additional permissions.

  When you convey a copy of a covered work, you may at your option
remove any additional permissions from that copy, or from any part of
it.  (Additional permissions may be written to require their own
removal in certain cases when you modify the work.)  You may place
additional permissions on material, added by you to a covered work,
for which you have or can give appropriate copyright permission.

  Notwithstanding any other provision of this License, for material you
add to a covered work, you may (if authorized by the copyright holders of
that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the
    terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or
    author attributions in that material or in the Appropriate Legal
    Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or
    requiring that modified versions of such material be marked in
    reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or
    authors of the material; or

    e) Declining to grant rights under trademark law for use of some
    trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that
    material by anyone who conveys the material (or modified versions of
    it) with contractual assumptions of liability to the recipient, for
    any liability that these contractual assumptions directly impose on
    those licensors and authors.

  All other non-permissive additional terms are considered "further
restrictions" within the meaning of section 10.  If the Program as you
received it, or any part of it, contains a notice stating that it is
governed by this License along with a term that is a further
restriction, you may remove that term.  If a license document contains
a further restriction but permits relicensing or conveying under this
License, you may add to a covered work material governed by the terms
of that license document, provided that the further restriction does
not survive such relicensing or conveying.

  If you add terms to a covered work in accord with this section, you
must place, in the relevant source files, a statement of the
additional terms that apply to those files, or a notice indicating
where to find the applicable terms.

  Additional terms, permissive or non-permissive, may be stated in the
form of a separately written license, or stated as exceptions;
the above requirements apply either way.

  8. Termination.

  You may not propagate or modify a covered work except as expressly
provided under this License.  Any attempt otherwise to propagate or
modify it is void, and will automatically terminate your rights under
this License (including any patent licenses granted under the third
paragraph of section 11).

  However, if you cease all violation of this License, then your
license from a particular copyright holder is reinstated (a)
provisionally, unless and until the copyright holder explicitly and
finally terminates your license, and (b) permanently, if the copyright
holder fails to notify you of the violation by some reasonable means
prior to 60 days after the cessation.

  Moreover, your license from a particular copyright holder is
reinstated permanently if the copyright holder notifies you of the
violation by some reasonable means, this is the first time you have
received notice of violation of this License (for any work) from that
copyright holder, and you cure the violation prior to 30 days after
your receipt of the notice.

  Termination of your rights under this section does not terminate the
licenses of parties who have received copies or rights from you under
this License.  If your rights have been terminated and not permanently
reinstated, you do not qualify to receive new licenses for the same
material under section 10.

  9. Acceptance Not Required for Having Copies.

  You are not required to accept this License in order to receive or
run a copy of the Program.  Ancillary propagation of a covered work
occurring solely as a consequence of using peer-to-peer transmission
to receive a copy likewise does not require acceptance.  However,
nothing other than this License grants you permission to propagate or
modify any covered work.  These actions infringe copyright if you do
not accept this License.  Therefore, by modifying or propagating a
covered work, you indicate your acceptance of this License to do so.

  10. Automatic Licensing of Downstream Recipients.

  Each time you convey a covered work, the recipient automatically
receives a license from the original licensors, to run, modify and
propagate that work, subject to this License.  You are not responsible
for enforcing compliance by third parties with this License.

  An "entity transaction" is a transaction transferring control of an
organization, or substantially all assets of one, or subdividing an
organization, or merging organizations.  If propagation of a covered
work results from an entity transaction, each party to that
transaction who receives a copy of the work also receives whatever
licenses to the work the party's predecessor in interest had or could
give under the previous paragraph, plus a right to possession of the
Corresponding Source of the work from the predecessor in interest, if
the predecessor has it or can get it with reasonable efforts.

  You may not impose any further restrictions on the exercise of the
rights granted or affirmed under this License.  For example, you may
not impose a license fee, royalty, or other charge for exercise of
rights granted under this License, and you may not initiate litigation
(including a cross-claim or counterclaim in a lawsuit) alleging that
any patent claim is infringed by making, using, selling, offering for
sale, or importing the Program or any portion of it.

  11. Patents.

  A "contributor" is a copyright holder who authorizes use under this
License of the Program or a work on which the Program is based.  The
work thus licensed is called the contributor's "contributor version".

  A contributor's "essential patent claims" are all patent claims
owned or controlled by the contributor, whether already acquired or
hereafter acquired, that would be infringed by some manner, permitted
by this License, of making, using, or selling its contributor version,
but do not include claims that would be infringed only as a
consequence of further modification of the contributor version.  For
purposes of this definition, "control" includes the right to grant
patent sublicenses in a manner consistent with the requirements of
this License.

  Each contributor grants you a non-exclusive, worldwide, royalty-free
patent license under the contributor's essential patent claims, to
make, use, sell, offer for sale, import and otherwise run, modify and
propagate the contents of its contributor version.

  In the following three paragraphs, a "patent license" is any express
agreement or commitment, however denominated, not to enforce a patent
(such as an express permission to practice a patent or covenant not to
sue for patent infringement).  To "grant" such a patent license to a
party means to make such an agreement or commitment not to enforce a
patent against the party.

  If you convey a covered work, knowingly relying on a patent license,
and the Corresponding Source of the work is not available for anyone
to copy, free of charge and under the terms of this License, through a
publicly available network server or other readily accessible means,
then you must either (1) cause the Corresponding Source to be so
available, or (2) arrange to deprive yourself of the benefit of the
patent license for this particular work, or (3) arrange, in a manner
consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have
actual knowledge that, but for the patent license, your conveying the
covered work in a country, or your recipient's use of the covered work
in a country, would infringe one or more identifiable patents in that
country that you have reason to believe are valid.

  If, pursuant to or in connection with a single transaction or
arrangement, you convey, or propagate by procuring conveyance of, a
covered work, and grant a patent license to some of the parties
receiving the covered work authorizing them to use, propagate, modify
or convey a specific copy of the covered work, then the patent license
you grant is automatically extended to all recipients of the covered
work and works based on it.

  A patent license is "discriminatory" if it does not include within
the scope of its coverage, prohibits the exercise of, or is
conditioned on the non-exercise of one or more of the rights that are
specifically granted under this License.  You may not convey a covered
work if you are a party to an arrangement with a third party that is
in the business of distributing software, under which you make payment
to the third party based on the extent of your activity of conveying
the work, and under which the third party grants, to any of the
parties who would receive the covered work from you, a discriminatory
patent license (a) in connection with copies of the covered work
conveyed by you (or copies made from those copies), or (b) primarily
for and in connection with specific products or compilations that
contain the covered work, unless you entered into that arrangement,
or that patent license was granted, prior to 28 March 2007.

  Nothing in this License shall be construed as excluding or limiting
any implied license or other defenses to infringement that may
otherwise be available to you under applicable patent law.

  12. No Surrender of Others' Freedom.

  If conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot convey a
covered work so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you
to collect a royalty for further conveying from those to whom you convey
the Program, the only way you could satisfy both those terms and this
License would be to refrain entirely from conveying the Program.

  13. Use with the GNU Affero General Public License.

  Notwithstanding any other provision of this License, you have
permission to link or combine any covered work with a work licensed
under version 3 of the GNU Affero General Public License into a single
combined work, and to convey the resulting work.  The terms of this
License will continue to apply to the part which is the covered work,
but the special requirements of the GNU Affero General Public License,
section 13, concerning interaction through a network will apply to the
combination as such.

  14. Revised Versions of this License.

  The Free Software Foundation may publish revised and/or new versions of
the GNU General Public License from time to time.  Such new versions will
be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

  Each version is given a distinguishing version number.  If the
Program specifies that a certain numbered version of the GNU General
Public License "or any later version" applies to it, you have the
option of following the terms and conditions either of that numbered
version or of any later version published by the Free Software
Foundation.  If the Program does not specify a version number of the
GNU General Public License, you may choose any version ever published
by the Free Software Foundation.

  If the Program specifies that a proxy can decide which future
versions of the GNU General Public License can be used, that proxy's
public statement of acceptance of a version permanently authorizes you
to choose that version for the Program.

  Later license versions may give you additional or different
permissions.  However, no additional obligations are imposed on any
author or copyright holder as a result of your choosing to follow a
later version.

  15. Disclaimer of Warranty.

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. Limitation of Liability.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

  17. Interpretation of Sections 15 and 16.

  If the disclaimer of warranty and limitation of liability provided
above cannot be given local legal effect according to their terms,
reviewing courts shall apply local law that most closely approximates
an absolute waiver of all civil liability in connection with the
Program, unless a warranty or assumption of liability accompanies a
copy of the Program in return for a fee.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
state the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    <one line to give the program's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

  If the program does terminal interaction, make it output a short
notice like this when it starts in an interactive mode:

    <program>  Copyright (C) <year>  <name of author>
    This program comes with ABSOLUTELY NO WARRANTY; for details type `show w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type `show c' for details.

The hypothetical commands `show w' and `show c' should show the appropriate
parts of the General Public License.  Of course, your program's commands
might be different; for a GUI interface, you would use an "about box".

  You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary.
For more information on this, and how to apply and follow the GNU GPL, see
<https://www.gnu.org/licenses/>.

  The GNU General Public License does not permit incorporating your program
into proprietary programs.  If your program is a subroutine library, you
may consider it more useful to permit linking proprietary applications with
the library.  If this is what you want to do, use the GNU Lesser General
Public License instead of this License.  But first, please read
<https://www.gnu.org/licenses/why-not-lgpl.html>.

----------------------------------------

LICENSES/osu-MIT.txt

Copyright (c) 2025 ppy Pty Ltd <contact@ppy.sh>.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
"use strict";(()=>{var cu=Object.defineProperty;var uu=(e,t,n)=>t in e?cu(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var A=(e,t,n)=>uu(e,typeof t!="symbol"?t+"":t,n);function vi(e,t){let n=document.getElementById("title"),r=document.createElement("span");r.textContent=e,n.replaceChildren(r),n.title=e,document.querySelector(".preview-heading-badges")?.remove();let o=document.createElement("div");o.className="preview-heading-badges";let i=document.createElement("span");i.className="preview-difficulty";let a=document.createElement("span");a.className="preview-difficulty-value",a.textContent=t?.value||"\u2014",i.append(a),i.title=i.textContent,t&&(i.style.backgroundColor=t.background,i.style.color=t.text,i.style.borderColor=t.border??t.background),o.append(i),n.after(o)}var Mn=class{constructor(){A(this,"a",null);A(this,"b",null)}toggle(t,n){this[t]=this[t]===null?n:null,this.a!==null&&this.b!==null&&this.a>this.b&&([this.a,this.b]=[this.b,this.a])}target(t){return this.a!==null&&this.b!==null&&this.a<this.b&&t>=this.b?this.a:null}};function wi(e,t){let n=o=>document.querySelectorAll(`#btn-loop-${o},#fs-loop-${o}`),r=()=>{for(let o of["a","b"]){let i=t.loop[o];for(let a of n(o))a.textContent=`${o.toUpperCase()} ${i===null?"\u2014":t.format(i)}`,a.classList.toggle("on",i!==null),a.setAttribute("aria-pressed",String(i!==null)),a.setAttribute("aria-label",`${i===null?"\u8BBE\u7F6E":"\u6E05\u9664"}\u5FAA\u73AF\u70B9 ${o.toUpperCase()}${i===null?"":` ${t.format(i)}`}`)}t.update(t.loop.a===null?null:t.percent(t.loop.a),t.loop.b===null?null:t.percent(t.loop.b))};for(let o of["a","b"])for(let i of n(o))e.listen(i,"click",()=>{t.loop.toggle(o,t.position()),r()});r()}function xi(e,t){let n=!1,r,o=new Set,i=null,a=()=>{clearTimeout(r),n=!1,t.render(!1)},s=()=>{clearTimeout(r),n=!0,t.render(!0),t.active()&&o.size===0&&(r=setTimeout(a,5e3))},l=u=>u instanceof Element&&!!u.closest('#controls,#fs-overlay,#fs-lock,button,input,[role="slider"],[tabindex]');return e.listen(document,"pointerdown",u=>{t.active()&&(o.add(u.pointerId),clearTimeout(r),i=o.size>1||l(u.target)?null:{id:u.pointerId,x:u.clientX,y:u.clientY})},!0),e.listen(document,"pointermove",u=>{i?.id===u.pointerId&&Math.hypot(u.clientX-i.x,u.clientY-i.y)>=8&&(i=null)},!0),e.listen(document,"pointerup",u=>{if(o.delete(u.pointerId),!t.active())return;let c=i;i=null,c?.id===u.pointerId&&!l(u.target)&&Math.hypot(u.clientX-c.x,u.clientY-c.y)<8?n?a():s():n&&s()},!0),e.listen(document,"pointercancel",u=>{o.delete(u.pointerId),i=null,n&&s()},!0),e.listen(document,"keydown",u=>{t.active()&&l(u.target)&&s()}),e.own(()=>clearTimeout(r)),{show:s,hide:a}}function we(e){let t=e&&typeof e=="object"?e:{},n=(o,i,a,s,l=1)=>{let u=t[o];return typeof u=="number"&&Number.isFinite(u)?Math.round(Math.min(s,Math.max(a,u))*l)/l:i},r=(o,i)=>typeof t[o]=="boolean"?t[o]:i;return{holdWidth:n("holdWidth",60,10,100),backgroundBrightness:n("backgroundBrightness",20,0,100),backgroundBlur:n("backgroundBlur",0,0,20),storyboardEnabled:r("storyboardEnabled",!0),videoEnabled:r("videoEnabled",!0),maniaIgnoreSV:r("maniaIgnoreSV",!1),maniaTrackOpacity:n("maniaTrackOpacity",100,0,100),taikoTrackOpacity:n("taikoTrackOpacity",100,0,100),maniaScrollSpeed:n("maniaScrollSpeed",8,1,40,10),maniaSkin:t.maniaSkin==="circle"?"circle":"brick"}}function Mi(e){let t=!e;return{locked:t,overlayHidden:t,actionLabel:t?"\u89E3\u9501":"\u9501\u5B9A"}}function Ti(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function du(e){if(Ti(e))return e;if(typeof e!="string")return null;try{let t=JSON.parse(e);return Ti(t)?t:null}catch{return null}}function mu(e){let t=du(e);if(!t)return null;switch(t.type){case"pause":{let n=t.cause;return n==="manual"||n==="lifecycle"?{type:"pause",cause:n}:null}case"exit-fullscreen":return{type:"exit-fullscreen"};case"dispose":return{type:"dispose"};case"background-video-confirmation-result":{let n=t.accepted;return typeof n=="boolean"?{type:"background-video-confirmation-result",accepted:n}:null}default:return null}}function Ci(e,t){let n=mu(e);if(n===null)return!1;switch(n.type){case"pause":return t.pause(n.cause),!0;case"exit-fullscreen":return t.exitFullscreen(),!0;case"dispose":return t.dispose(),!0;case"background-video-confirmation-result":return t.confirm?.(n.accepted),!0}}function kr(e){let t=0,n,r=!1,o=()=>{if(t=0,!r)return;let i=n;n=void 0,r=!1,e(i)};return{schedule(i){n=i,r=!0,t===0&&(t=requestAnimationFrame(o))},flush(){t!==0&&cancelAnimationFrame(t),o()},cancel(){t!==0&&cancelAnimationFrame(t),t=0,n=void 0,r=!1}}}var Ve=class{constructor(t){this.isDisposed=t;A(this,"cleanups",[]);A(this,"closed",!1)}listen(t,n,r,o){if(this.closed)return;let i=r,a=s=>{this.closed||this.isDisposed()||(typeof i=="function"?i.call(t,s):i.handleEvent(s))};t.addEventListener(n,a,o),this.own(()=>t.removeEventListener(n,a,o))}own(t){this.closed?t():this.cleanups.push(t)}dispose(){if(!this.closed){this.closed=!0;for(let t of this.cleanups.splice(0).reverse())try{t()}catch{}}}};var jt=null,Ir=new Set;function ft(){jt?.();for(let e of Ir)e()}function Er(e,t,n){return Math.min(n,Math.max(t,e))}var ki=28;function Ii(e,t,n){let r=[];for(let o=0;e+o*n<=t+1e-9;o+=1)r.push(Number((e+o*n).toFixed(8)));return r}function fu(e,t,n,r,o,i,a,s,l,u){let c=Ii(o,i,a),d=c.includes(s)?s:c[0]??o,m=0,f=null,h=!1,p=!1,b=kr(n),S=C=>{if(l){let E=c.indexOf(C);return l[E]??String(C)}return u?u(C):C.toFixed(1)};(()=>{let C=c.map(E=>{let R=document.createElement("div");return R.className="wheel-item",R.dataset.value=String(E),R.textContent=S(E),R.setAttribute("role","option"),R.setAttribute("aria-selected",E===d?"true":"false"),E===d&&(f=R),R});t.replaceChildren(...C)})();let v=C=>Math.max(0,c.findIndex(E=>Math.abs(E-C)<1e-9)),x=(C,E)=>{d=C,f?.setAttribute("aria-selected","false"),f=t.children[v(C)],f?.setAttribute("aria-selected","true"),E&&(h=!0,b.schedule(C))},k=(C,E="auto")=>{let R=v(C);e.scrollTo({top:R*ki,behavior:E})},M=()=>{let C=Er(Math.round(e.scrollTop/ki),0,c.length-1);return c[C]},y=(C,E=!1)=>{if(p)return;let R=c[v(C)]??c[0]??o;x(R,E),k(R)},w=()=>{p||(window.clearTimeout(m),b.flush(),h&&(h=!1,r(d)))},T=()=>{if(p)return;let C=M();Math.abs(C-d)>1e-9&&x(C,!0),window.clearTimeout(m),m=window.setTimeout(()=>{let E=M();k(E,"smooth"),w()},120)};return e.addEventListener("scroll",T,{passive:!0}),k(d),x(d,!1),{getValue:()=>d,setValue:y,flush:w,dispose(){p=!0,b.cancel(),window.clearTimeout(m),e.removeEventListener("scroll",T)}}}function Ei(e,t,n,r,o,i,a,s,l,u,c,d,m){if(e.dataset.presentation==="inline")return t.hidden=!0,pu(e,o,i,a,s,l,u,c,d,m);let f=fu(n,r,x=>{o.textContent=d?d[x]??String(x):m?m(x):x.toFixed(1),i(x)},a,s,l,u,c,d,m),h=!1,p=()=>{jt?.(),h=!0,t.style.visibility="",t.style.pointerEvents="";let x=e.getBoundingClientRect();t.style.bottom=`${window.innerHeight-x.top+4}px`,t.style.left=`${x.left+x.width/2}px`,t.style.transform="translateX(-50%)",f.setValue(f.getValue()),jt=b},b=()=>{f.flush(),h=!1,t.style.visibility="hidden",t.style.pointerEvents="none",jt===b&&(jt=null)},S=x=>{x.stopPropagation(),h?b():p()},g=()=>{h&&b()},v=x=>x.stopPropagation();return e.addEventListener("click",S),document.addEventListener("click",g),t.addEventListener("click",v),t.addEventListener("touchstart",v),o.textContent=d?d[Math.round(c)]??String(c):m?m(c):c.toFixed(1),{getValue:f.getValue,flush:f.flush,setValue:(x,k=!1)=>{o.textContent=d?d[Math.round(x)]??String(x):m?m(x):x.toFixed(1),f.setValue(x,k)},dispose(){f.dispose(),b(),e.removeEventListener("click",S),document.removeEventListener("click",g),t.removeEventListener("click",v),t.removeEventListener("touchstart",v)}}}function pu(e,t,n,r,o,i,a,s,l,u){let c=Ii(o,i,a),d=I=>Er(Math.round((I-o)/a),0,c.length-1),m=d(s),f=!1,h=!1,p=0,b=new Ve(()=>f),S=kr(n),g=e.closest(".field"),v=g?Array.from(g.childNodes).filter(I=>I.nodeType===3||I instanceof HTMLElement&&I.tagName==="SPAN"):[],x=v.map(I=>I.textContent?.trim()).filter(Boolean).join(" ")||e.getAttribute("aria-label")||"\u53C2\u6570",k=document.createElement("span");k.hidden=!0,k.append(...v),g?.append(k),e.classList.add("parameter-control"),e.dataset.enum=String(!!l),e.setAttribute("role","slider"),e.setAttribute("aria-label",x),e.setAttribute("aria-orientation","horizontal"),e.setAttribute("aria-valuemin",String(o)),e.setAttribute("aria-valuemax",String(i));let M=document.createElement("span");M.className="parameter-head";let y=document.createElement("span");y.className="parameter-label",y.textContent=x,t.classList.add("parameter-value"),M.append(y,t);let w=document.createElement("span");w.className="parameter-rail",w.setAttribute("aria-hidden","true");let T=document.createElement("span");if(T.className="parameter-options",l){for(let[I,B]of l.entries()){let j=document.createElement("span");j.dataset.index=String(I),j.textContent=B,T.append(j)}w.append(T)}else for(let I of["parameter-ticks","parameter-cursor"]){let B=document.createElement("span");B.className=I,w.append(B)}e.replaceChildren(M,w);let C=()=>{let I=c[m],B=l?.[m]??(u?u(I):I.toFixed(1));t.textContent=B,e.setAttribute("aria-valuenow",String(I)),e.setAttribute("aria-valuetext",B),e.style.setProperty("--parameter-position",`${c.length>1?m/(c.length-1)*100:0}%`),Array.from(T.children).forEach((j,K)=>j.classList.toggle("selected",K===m))},E=()=>{f||(window.clearTimeout(p),S.flush(),h&&(h=!1,r(c[m])))},R=(I,B=!1)=>{f||!Number.isFinite(I)||(m=d(I),C(),B&&(h=!0,S.schedule(c[m]),window.clearTimeout(p),p=window.setTimeout(E,120)))},D=()=>!(e instanceof HTMLButtonElement&&e.disabled)&&!g?.hidden,_=I=>{let B=Er(Math.round(I),0,c.length-1);D()&&m!==B&&R(c[B],!0)},P=null,U=()=>{let I=P?.id;P=null,e.classList.remove("is-dragging"),I!==void 0&&e.hasPointerCapture?.(I)&&e.releasePointerCapture(I)};b.listen(e,"keydown",I=>{if(!D()||I.altKey||I.ctrlKey||I.metaKey)return;let B=l?1:Math.max(1,Math.round((c.length-1)/10)),j={ArrowRight:m+1,ArrowUp:m+1,ArrowLeft:m-1,ArrowDown:m-1,Home:0,End:c.length-1,PageUp:m+B,PageDown:m-B};I.key in j?(I.preventDefault(),I.stopPropagation(),_(j[I.key])):(I.key===" "||I.key==="Enter")&&(I.preventDefault(),I.stopPropagation())}),b.listen(e,"pointerdown",I=>{if(!D()||I.isPrimary===!1||I.button!==0)return;let B=I.target instanceof Element?I.target:null,j=B?.closest("[data-index]");P={id:I.pointerId,x:I.clientX,y:I.clientY,index:m,axis:"pending",rail:!!B?.closest(".parameter-rail"),...j?{option:Number(j.dataset.index)}:{}},e.focus({preventScroll:!0}),I.pointerType!=="touch"&&I.preventDefault()}),b.listen(window,"pointermove",I=>{if(!P||I.pointerId!==P.id)return;let B=I.clientX-P.x,j=I.clientY-P.y;if(P.axis==="pending"){if(Math.max(Math.abs(B),Math.abs(j))<6)return;if(Math.abs(j)>Math.abs(B)){P.axis="vertical";return}P.axis="horizontal",e.classList.add("is-dragging"),e.setPointerCapture?.(I.pointerId)}if(P.axis!=="horizontal")return;I.cancelable&&I.preventDefault();let K=l?Math.max(28,w.getBoundingClientRect().width/Math.max(2,c.length)):4;_(P.index+Math.round(B/K))},{passive:!1}),b.listen(window,"pointerup",I=>{if(!(!P||I.pointerId!==P.id)){if(P.axis==="pending"&&P.rail){let B=w.getBoundingClientRect();_(P.option??(I.clientX-B.left)/Math.max(1,B.width)*(c.length-1))}U(),E()}}),b.listen(window,"pointercancel",I=>{P?.id===I.pointerId&&(U(),E())}),b.listen(e,"lostpointercapture",I=>{I.target!==e||I.pointerId!==P?.id||(U(),E())});let H=()=>{U(),E()};return Ir.add(H),C(),{getValue:()=>c[m],setValue:R,flush:E,dispose(){U(),f=!0,Ir.delete(H),b.dispose(),window.clearTimeout(p),S.cancel()}}}var hu={normalSet:0,additionSet:0,index:0,volume:0,filename:""};function pt(e,t){if(!Number.isFinite(e))throw new Error(`\u8C31\u9762\u6570\u503C\u65E0\u6548\uFF1A${t}`);return e}function Tn(e){if(!Number.isSafeInteger(e))throw new Error("\u8C31\u9762\u65F6\u95F4\u65E0\u6548");return e}function bu(e,t){if(t&&e.trim().toLowerCase()==="nan")return NaN;let n=pt(parseFloat(e),"BeatLength");if(!t&&n<=0)throw new Error("\u8C31\u9762\u8282\u62CD\u957F\u5EA6\u65E0\u6548");return n}function Cn(e){if(e===""||e===void 0)return hu;let t=e.split(":");return{normalSet:parseInt(t[0]??"0",10)||0,additionSet:parseInt(t[1]??"0",10)||0,index:parseInt(t[2]??"0",10)||0,volume:parseInt(t[3]??"0",10)||0,filename:(t[4]??"").trim()}}function gu(e){let t=Number(e[6]??"1"),n=Number(e[7]??"0");if(!Number.isSafeInteger(t)||t<1)throw new Error("\u6ED1\u6761\u91CD\u590D\u6B21\u6570\u65E0\u6548");if(!Number.isFinite(n)||n<0)throw new Error("\u6ED1\u6761\u957F\u5EA6\u65E0\u6548");return{slides:t,length:n}}function Ar(e){let t={mode:0,title:"",beatmapId:null,beatmapsetId:null,artist:"",version:"",audioFilename:"",audioLeadIn:0,approachRate:0,circleSize:0,overallDifficulty:0,hpDrainRate:0,sliderMultiplier:1,sliderTickRate:1,stackLeniency:.7,formatVersion:14,timingPoints:[],hitObjects:[],maniaHolds:[],breaks:[]},n=e.split(/\r?\n/),r="";for(let i of n){let a=i.trim();if(a==="")continue;let s=/^osu file format v(\d+)\s*$/i.exec(a);s&&(t.formatVersion=parseInt(s[1]??"14",10)||14);break}let o=!1;for(let i of n){let a=i.trim();if(a===""||a.startsWith("//"))continue;let s=/^\[(\w+)\]$/.exec(a);if(s){r=s[1]??"";continue}switch(r){case"General":{let l=a.indexOf(":");if(l===-1)break;let u=a.slice(0,l).trim(),c=a.slice(l+1).trim();if(u==="AudioFilename")t.audioFilename=c;else if(u==="AudioLeadIn")t.audioLeadIn=parseInt(c,10)||0;else if(u==="Mode"){let d=parseInt(c,10);(d===0||d===1||d===2||d===3)&&(t.mode=d)}else if(u==="StackLeniency"){let d=parseFloat(c);isNaN(d)||(t.stackLeniency=d)}break}case"Metadata":{let l=a.indexOf(":");if(l===-1)break;let u=a.slice(0,l).trim(),c=a.slice(l+1).trim();if(u==="Title")t.title=c;else if(u==="Artist")t.artist=c;else if(u==="Version")t.version=c;else if(u==="BeatmapID"||u==="BeatmapSetID"){let d=/^\d+$/.test(c)?Number(c):NaN,m=Number.isSafeInteger(d)&&d>0?d:null;u==="BeatmapID"?t.beatmapId=m:t.beatmapsetId=m}break}case"Difficulty":{let l=a.indexOf(":");if(l===-1)break;let u=a.slice(0,l).trim(),c=parseFloat(a.slice(l+1).trim());u==="HPDrainRate"?t.hpDrainRate=c:u==="CircleSize"?t.circleSize=c:u==="OverallDifficulty"?t.overallDifficulty=c:u==="ApproachRate"?(t.approachRate=c,o=!0):u==="SliderMultiplier"?t.sliderMultiplier=c:u==="SliderTickRate"&&(t.sliderTickRate=c);break}case"Events":{let l=a.split(",");if(l.length<3)break;let u=(l[0]??"").trim();if(u!=="2"&&u.toLowerCase()!=="break")break;let c=parseInt(l[1]??"0",10),d=parseInt(l[2]??"0",10);!isNaN(c)&&!isNaN(d)&&d>c&&t.breaks.push({startTime:c,endTime:d});break}case"TimingPoints":{let l=a.split(",");if(l.length<2)break;let u=parseInt(l[0]??"0",10),c=parseInt(l[2]??"4",10),d=parseInt(l[6]??"1",10),m=bu(l[1]??"0",d===0);Tn(u);let f=parseInt(l[7]??"0",10),h=parseInt(l[5]??"",10),p=Number.isFinite(h)?Math.max(0,Math.min(100,h)):100,b={time:u,beatLength:m,meter:c,inherited:d===0,sampleSet:parseInt(l[3]??"0",10)||0,sampleIndex:parseInt(l[4]??"0",10)||0,volume:p,kiai:(f&1)!==0};t.timingPoints.push(b);break}case"HitObjects":{let l=a.split(",");if(l.length<5)break;let u=parseInt(l[0]??"0",10),c=parseInt(l[1]??"0",10),d=parseInt(l[2]??"0",10),m=parseInt(l[3]??"0",10),f=parseInt(l[4]??"0",10);pt(u,"x"),pt(c,"y"),Tn(d);let h=(m&4)!==0,p=m>>4&7,b=null;if(m&1)b={type:"circle",x:u,y:c,time:d,hitSound:f,hitSample:Cn(l[5]??""),newCombo:h,comboSkip:p,stackHeight:0};else if(m&2){let S=l[5]??"",{slides:g,length:v}=gu(l),x=S.split("|"),k=(x[0]??"B").trim(),M=["B","L","P","C"].includes(k)?k:"B",y=[{x:u,y:c}];for(let D=1;D<x.length;D++){let _=x[D]?.split(":");_&&_.length>=2&&y.push({x:pt(parseInt(_[0]??"0",10),"control x"),y:pt(parseInt(_[1]??"0",10),"control y")})}let w=l[8]??"",T=w!==""?w.split("|").map(D=>parseInt(D,10)||0):[],C=l[9]??"",E=[];if(C!=="")for(let D of C.split("|")){let[_,P]=D.split(":");E.push({normalSet:parseInt(_??"0",10)||0,additionSet:parseInt(P??"0",10)||0})}b={type:"slider",x:u,y:c,time:d,curveType:M,curvePoints:y,slides:g,length:v,hitSound:f,hitSample:Cn(l[10]??""),newCombo:h,comboSkip:p,edgeSounds:T,edgeSets:E,stackHeight:0}}else if(m&8){let S=Tn(parseInt(l[5]??"0",10));b={type:"spinner",time:d,endTime:S,hitSound:f,hitSample:Cn(l[6]??"")}}else if(m&128){let S=l[5]??"",g=S.indexOf(":"),v=Tn(parseInt(g===-1?S:S.slice(0,g),10)),x=g===-1?"":S.slice(g+1),k={type:"hold",x:u,time:d,endTime:v,hitSound:f,hitSample:Cn(x)};t.maniaHolds.push(k)}b!==null&&t.hitObjects.push(b);break}}}o||(t.approachRate=t.overallDifficulty);for(let i of["hpDrainRate","circleSize","overallDifficulty","approachRate","sliderMultiplier","sliderTickRate","stackLeniency"])pt(t[i],i);if(t.sliderMultiplier<=0||t.sliderTickRate<=0)throw new Error("\u8C31\u9762\u6ED1\u6761\u500D\u7387\u65E0\u6548");return t.timingPoints.sort((i,a)=>i.time!==a.time?i.time-a.time:!i.inherited&&a.inherited?-1:i.inherited&&!a.inherited?1:0),t.hitObjects.sort((i,a)=>i.time-a.time),t}var yu=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21],Ai=new Uint32Array(64);for(let e=0;e<64;e++)Ai[e]=Math.abs(Math.sin(e+1))*4294967296>>>0;function Su(e,t){return e<<t|e>>>32-t}function Rr(e){let t=e.length,n=t%64<56?56-t%64:120-t%64,r=new Uint8Array(t+n+8);r.set(e),r[t]=128;let o=new DataView(r.buffer),i=t*8>>>0,a=Math.floor(t/536870912)>>>0;o.setUint32(t+n,i,!0),o.setUint32(t+n+4,a,!0);let s=1732584193,l=4023233417,u=2562383102,c=271733878;for(let m=0;m<r.length;m+=64){let f=new Uint32Array(16);for(let g=0;g<16;g++)f[g]=o.getUint32(m+g*4,!0);let h=s,p=l,b=u,S=c;for(let g=0;g<64;g++){let v,x;g<16?(v=p&b|~p&S,x=g):g<32?(v=S&p|~S&b,x=(5*g+1)%16):g<48?(v=p^b^S,x=(3*g+5)%16):(v=b^(p|~S),x=7*g%16),v=v+h+Ai[g]+f[x]>>>0,h=S,S=b,b=p,p=p+Su(v,yu[g])>>>0}s=s+h>>>0,l=l+p>>>0,u=u+b>>>0,c=c+S>>>0}let d="";for(let m of[s,l,u,c])for(let f=0;f<4;f++)d+=(m>>>f*8&255).toString(16).padStart(2,"0");return d}var ae={NoFail:1,Easy:2,TouchDevice:4,Hidden:8,HardRock:16,SuddenDeath:32,DoubleTime:64,Relax:128,HalfTime:256,Nightcore:576,Flashlight:1024,SpunOut:4096,Perfect:16384};function xe(e,t){return(e&t)!==0}function Ae(e,t,n,r){return e=Math.fround(e),e>5?n+(r-n)*(e-5)/5:e<5?n-(n-t)*(5-e)/5:n}function kn(e,t,n){if(!e)return n;let r=e[t];return typeof r=="boolean"?r:n}function Be(e,t){if(!e)return;let n=e[t];return typeof n=="number"?n:void 0}function vu(e,t,n){if(!e)return!1;let r=e.match(/^(\d{4})\.(\d{1,4})/);if(!r)return!1;let o=parseInt(r[1],10),i=parseInt(r[2],10);return o!==t?o>t:i>=n}function Ut(e,t){let n=t.scoreInfo,r=n!==void 0||t.gameVersion>=3e7,o=e.approachRate,i=e.circleSize,a=e.overallDifficulty,s=e.hpDrainRate,l=1,u=e.overallDifficulty,c=!1,d=!1,m=!1,f=!1,h=!1,p=!1,b=!1,S=!1,g=!1,v=!1,x=!1,k=!1,M=!1,y=!1,w=!1,T=.5,C=!0,E=1,R=!1,D=!1,_=!1,P=!1,U=!1;if(n&&n.mods.length>0){for(let X of n.mods)if(X.acronym==="DA"){let He=Be(X.settings,"approach_rate"),Qe=Be(X.settings,"circle_size"),yi=Be(X.settings,"overall_difficulty"),Si=Be(X.settings,"drain_rate");He!==void 0&&(o=He),Qe!==void 0&&(i=Qe),yi!==void 0&&(a=yi),Si!==void 0&&(s=Si)}u=a;for(let X of n.mods)switch(X.acronym){case"HR":c=!0,o=Math.min(o*1.4,10),i=Math.min(i*1.3,10),a=Math.min(a*1.4,10),s=Math.min(s*1.4,10),E=1.4;break;case"EZ":d=!0,o/=2,i/=2,a/=2,s/=2,E=1/1.4;break;case"DT":{m=!0,l=Be(X.settings,"speed_change")??1.5;break}case"NC":{m=!0,h=!0,l=Be(X.settings,"speed_change")??1.5;break}case"HT":{f=!0,l=Be(X.settings,"speed_change")??.75;break}case"DC":{f=!0,l=Be(X.settings,"speed_change")??.75;break}case"HD":p=!0;break;case"FL":b=!0;break;case"CS":k=!0;break;case"MR":M=!0;break;case"FI":y=!0;break;case"CO":{w=!0;let He=Be(X.settings,"coverage");He!==void 0&&(T=He);let Qe=X.settings?.direction;typeof Qe=="number"?C=Qe===0:typeof Qe=="string"&&(C=!/against/i.test(Qe));break}case"NF":S=!0;break;case"SD":g=!0;break;case"PF":g=!0,v=!0;break;case"AC":x=!0;break;case"CL":R=!0,D=kn(X.settings,"no_slider_head_accuracy",!0),_=kn(X.settings,"classic_note_lock",!0),P=kn(X.settings,"always_play_tail_sample",!0),U=kn(X.settings,"classic_health",!0);break}}else{let X=t.mods;xe(X,ae.HardRock)&&(c=!0,o=Math.min(o*1.4,10),i=Math.min(i*1.3,10),a=Math.min(a*1.4,10),s=Math.min(s*1.4,10),E=1.4),xe(X,ae.Easy)&&(d=!0,o/=2,i/=2,a/=2,s/=2,E=1/1.4),xe(X,ae.DoubleTime)?(m=!0,l=1.5):xe(X,ae.HalfTime)&&(f=!0,l=.75),xe(X,512)&&(h=!0),xe(X,ae.Hidden)&&(p=!0),xe(X,ae.Flashlight)&&(b=!0),xe(X,ae.NoFail)&&(S=!0),xe(X,ae.SuddenDeath)&&(g=!0),xe(X,ae.Perfect)&&(g=!0,v=!0),xe(X,1<<20)&&(y=!0),xe(X,1<<30)&&(M=!0)}let H=Ae(o,1800,1200,450),I=400*Math.min(1,H/450),B=r?54.4-4.48*i:(54.4-4.48*i)*1.00041,j=80-6*a,K=140-8*a,V=200-10*a,G=Math.floor(j),F=Math.floor(K),L=Math.floor(V),N=Ae(a,50,35,20),O=Ae(a,120,80,50),W=Ae(a,135,95,70),Q=Math.floor(N)-.5,se=Math.floor(O)-.5,J=Math.floor(W)-.5,Se=!r||vu(n?.client_version,2025,509),$=l/(Se?E:1),ve=!r||R?Math.floor(16*$)+.5:Math.floor(Ae(u,22.4,19.4,13.9)*$)+.5,fe=Math.floor(Ae(u,64,49,34)*$)+.5,De=Math.floor(Ae(u,97,82,67)*$)+.5,$e=Math.floor(Ae(u,127,112,97)*$)+.5,wn=Math.floor(Ae(u,151,136,121)*$)+.5,xn=Math.floor(Ae(u,188,173,158)*$)+.5,ie;return n?(ie=0,c&&(ie|=ae.HardRock),d&&(ie|=ae.Easy),m&&(ie|=ae.DoubleTime),f&&(ie|=ae.HalfTime),h&&(ie|=512),p&&(ie|=ae.Hidden),b&&(ie|=ae.Flashlight),S&&(ie|=ae.NoFail),g&&(ie|=ae.SuddenDeath),v&&(ie|=ae.Perfect),y&&(ie|=1<<20),M&&(ie|=1<<30)):ie=t.mods,{ar:o,cs:i,od:a,hp:s,preemptMs:H,fadeInMs:I,circleRadiusPx:B,hitWindow300:G,hitWindow100:F,hitWindow50:L,hitWindow300U:j,hitWindow100U:K,hitWindow50U:V,taikoHitWindowGreat:Q,taikoHitWindowOk:se,taikoHitWindowMiss:J,taikoHitWindowGreatU:N,taikoHitWindowOkU:O,taikoHitWindowMissU:W,maniaHitWindowPerfect:ve,maniaHitWindowGreat:fe,maniaHitWindowGood:De,maniaHitWindowOk:$e,maniaHitWindowMeh:wn,maniaHitWindowMiss:xn,speed:l,mods:ie,isHR:c,isEZ:d,isDT:m,isHT:f,isNC:h,isHD:p,isFL:b,isNF:S,isSD:g,isPF:v,isAC:x,isMirror:M,isFadeIn:y,isCover:w,coverCoverage:T,coverAlong:C,isLazer:r,isCL:R,isConstantSpeed:k,lzNoSliderAcc:D,lzLegacyNotelock:_,lzLegacySound:P,lzLegacyHP:U}}var Ri=new WeakMap,wu=Object.freeze({normalSet:0,additionSet:0});function et(e){return e<0?Math.max(.1,Math.min(10,-100/e)):1}function ht(e,t){return{hitSound:e.edgeSounds[t]??e.hitSound,...e.edgeSets[t]??wu}}function*Pi(e,t,n,r){let o=500,i=!0;for(let l of e.timingPoints){if(l.time>t.time)break;l.inherited||(o=l.beatLength),i=!Number.isNaN(l.beatLength)}let a=o/e.sliderTickRate,s=i&&Number.isFinite(a)&&a>0;for(let l=0;l<t.slides;l++){let u=t.time+l*n;if(s)if(r)for(let c=1;c*a<=n-1;c++)yield{t:u+c*a,kind:"tick"};else for(let c=u+a;c<u+n-1;c+=a)yield{t:c,kind:"tick"};l<t.slides-1&&(yield{t:t.time+n*(l+1),kind:"repeat"})}yield{t:t.time+n*t.slides,kind:"tail"}}function le(e,t){let n=Ri.get(t);if(n!==void 0)return n;let r=500,o=1;for(let s of e.timingPoints){if(s.time>t.time)break;s.inherited?o=et(s.beatLength):(r=s.beatLength,o=1)}let i=100*e.sliderMultiplier*o/r,a=i>0?t.length/i:1e3;return Ri.set(t,a),a}var _i=new WeakMap;function ue(e){let t=_i.get(e);return t===void 0&&(t=xu(e),_i.set(e,t)),t}function xu(e){let{curveType:t,curvePoints:n,length:r}=e;switch(t){case"L":return Oi(n,r);case"P":return Mu(n,r);case"C":case"B":default:return Di(n,r)}}function Pr(e){for(let t of e.hitObjects)t.type==="slider"&&ue(t)}function Oi(e,t){if(e.length===0)return[];if(e.length===1||t<=0)return[{...e[0]}];let n=Math.max(2,Math.ceil(t)+1),r=Hi(e),o=Math.min(t,r[r.length-1]),i=[];for(let a=0;a<n;a++){let s=a/(n-1)*o;i.push(Bi(e,r,s))}return i}function Di(e,t){if(e.length===0)return[];if(e.length===1||t<=0)return[{...e[0]}];let n=Tu(e),r=[];for(let o of n){let i=ku(o),a=Math.max(2,Math.ceil(i)+1),s=r.length===0;for(let l=s?0:1;l<a;l++)r.push(Cu(o,l/(a-1)))}return Iu(r,t,Math.max(2,Math.ceil(t)+1))}function Mu(e,t){if(e.length!==3)return Di(e,t);if(t<=0)return[{...e[0]}];let[n,r,o]=[e[0],e[1],e[2]],i=Math.max(2,Math.ceil(t)+1),a=2*(n.x*(r.y-o.y)+r.x*(o.y-n.y)+o.x*(n.y-r.y));if(Math.abs(a)<1e-6)return Oi(e,t);let s=n.x*n.x+n.y*n.y,l=r.x*r.x+r.y*r.y,u=o.x*o.x+o.y*o.y,c=(s*(r.y-o.y)+l*(o.y-n.y)+u*(n.y-r.y))/a,d=(s*(o.x-r.x)+l*(n.x-o.x)+u*(r.x-n.x))/a,m=Math.hypot(n.x-c,n.y-d),f=Math.atan2(n.y-d,n.x-c),h=Math.atan2(r.y-d,r.x-c),p=Math.atan2(o.y-d,o.x-c),b=Li(h-f),S=Li(p-f),g=b<S?S:S-2*Math.PI,v=Math.abs(g)*m,x=v>0?g*Math.min(1,t/v):0,k=[];for(let M=0;M<i;M++){let y=f+x*(M/(i-1));k.push({x:c+m*Math.cos(y),y:d+m*Math.sin(y)})}return k}function Tu(e){let t=[],n=[e[0]],r=1;for(;r<e.length;)n.push(e[r]),r+1<e.length&&e[r].x===e[r+1].x&&e[r].y===e[r+1].y?(t.push(n),n=[e[r+1]],r+=2):r++;return n.length>1&&t.push(n),t.length>0?t:[e]}function Cu(e,t){let n=e.map(r=>({x:r.x,y:r.y}));for(let r=1;r<n.length;r++)for(let o=0;o<n.length-r;o++)n[o]={x:n[o].x+(n[o+1].x-n[o].x)*t,y:n[o].y+(n[o+1].y-n[o].y)*t};return n[0]}function ku(e){let t=0;for(let n=1;n<e.length;n++)t+=Math.hypot(e[n].x-e[n-1].x,e[n].y-e[n-1].y);return t}function Hi(e){let t=[0];for(let n=1;n<e.length;n++)t.push(t[n-1]+Math.hypot(e[n].x-e[n-1].x,e[n].y-e[n-1].y));return t}function Iu(e,t,n){let r=Hi(e),o=Math.min(t,r[r.length-1]),i=[];for(let a=0;a<n;a++){let s=a/(n-1)*o;i.push(Bi(e,r,s))}return i}function Bi(e,t,n){if(n<=0)return{...e[0]};if(n>=t[t.length-1])return{...e[e.length-1]};let r=0,o=t.length-2;for(;r<o;){let d=r+o>>1;t[d+1]<n?r=d+1:o=d}let i=t[r],s=t[r+1]-i,l=s<1e-10?0:(n-i)/s,u=e[r],c=e[r+1];return{x:u.x+(c.x-u.x)*l,y:u.y+(c.y-u.y)*l}}function Li(e){let t=2*Math.PI;return(e%t+t)%t}var Me=3;function In(e,t){if(t.type==="slider"){let n=le(e,t);return t.time+n*t.slides}return t.type==="spinner"?t.endTime:t.time}var Fi=new WeakMap;function _r(e){if(e.slides%2===0)return{x:e.x,y:e.y};let t=Fi.get(e);if(t)return t;let n=ue(e),r=n.length>0?{x:n[n.length-1].x,y:n[n.length-1].y}:{x:e.x,y:e.y};return Fi.set(e,r),r}function Lr(e,t){let n=e.hitObjects;if(n.length!==0){for(let r of n)r.type!=="spinner"&&(r.stackHeight=0);e.formatVersion>=6?Eu(e,t):Au(e,t)}}function Eu(e,t){let n=e.hitObjects,r=n.length,o=t.preemptMs*e.stackLeniency;for(let i=r-1;i>0;i--){let a=n[i];if(a.type!=="spinner"&&a.stackHeight===0)if(a.type==="circle"){let s=i;for(let l=s-1;l>=0;l--){let u=n[l];if(u.type==="spinner")continue;let c=In(e,u);if(n[s].time-c>o)break;if(u.type==="slider"){let h=_r(u),p=n[s],b=h.x-p.x,S=h.y-p.y;if(b*b+S*S<Me*Me){let g=p.stackHeight-u.stackHeight+1;for(let v=l+1;v<=i;v++){let x=n[v];if(x.type==="spinner")continue;let k=h.x-x.x,M=h.y-x.y;k*k+M*M<Me*Me&&(x.stackHeight-=g)}break}}let d=n[s],m=u.x-d.x,f=u.y-d.y;m*m+f*f<Me*Me&&(u.stackHeight=d.stackHeight+1,s=l)}}else{let s=i;for(let l=s-1;l>=0;l--){let u=n[l];if(u.type==="spinner")continue;if(n[s].time-u.time>o)break;let c=u.type==="slider"?_r(u):{x:u.x,y:u.y},d=n[s],m=c.x-d.x,f=c.y-d.y;m*m+f*f<Me*Me&&(u.stackHeight=d.stackHeight+1,s=l)}}}}function Au(e,t){let n=e.hitObjects,r=n.length,o=t.preemptMs*e.stackLeniency;for(let i=0;i<r;i++){let a=n[i];if(a.type==="spinner"||a.stackHeight!==0&&a.type!=="slider")continue;let s=In(e,a),l=0,u=a.type==="slider"?_r(a):{x:a.x,y:a.y};for(let c=i+1;c<r;c++){let d=n[c];if(d.type==="spinner")continue;if(d.time-s>o)break;let m=d.x-a.x,f=d.y-a.y;if(m*m+f*f<Me*Me){a.stackHeight++,s=In(e,d);continue}if(a.type==="slider"){let h=d.x-u.x,p=d.y-u.y;h*h+p*p<Me*Me&&(l++,d.stackHeight-=l,s=In(e,d))}}}}function $t(e,t,n,r=0){let o=[...n].sort((s,l)=>s.time-l.time),i=new Array(o.length),a=0;for(let s=0;s<o.length;s++){let l=o[s];i[s]={timeDelta:l.time-a,x:l.x,y:l.y,keys:l.keys},a=l.time}return{mode:e.mode,gameVersion:20240101,beatmapHash:t,username:"osu!",replayHash:"",count300:0,count100:0,count50:0,countGeki:0,countKatu:0,countMiss:0,score:0,maxCombo:0,perfect:!1,mods:r,lifebarGraph:"",timestamp:0n,frames:i,replayId:0n}}var bt=1e3/60,Ru=100,Br=50,Pu=266,An=50,Ni=.05,Dr=256,Hr=192,Or=5,Wi=10;function _u(e){return e*(2-e)}function Lu(e){return e*e}function En(e){return e.last}function Fe(e,t){return e.last=t,t}function ji(e,t,n,r,o){let i=Math.max(0,Math.min(o,(t-n)/r)),a=Math.min(Math.floor(i),o-1),s=i-a;a%2===1&&(s=1-s);let l=s*(e.length-1),u=Math.floor(l),c=Math.min(u+1,e.length-1),d=l-u;return{x:e[u].x+(e[c].x-e[u].x)*d,y:e[u].y+(e[c].y-e[u].y)*d}}function*Ou(e,t,n,r,o,i,a){let s=En(e),{x:l,y:u}=s,c=s.keys,d=r-Math.max(0,o-Ru),m=s.time;d>s.time&&(c!==0&&a<=d&&(yield Fe(e,{time:a,x:l,y:u,keys:0}),c=0),yield Fe(e,{time:d,x:l,y:u,keys:c}),m=d);let f=r-m;if(f<=0)return;let h=i?Lu:_u;for(let p=m+bt;p<r;p+=bt){c!==0&&p>=a&&(c=0);let b=h((p-m)/f);yield Fe(e,{time:Math.trunc(p),x:l+(t-l)*b,y:u+(n-u)*b,keys:c})}}function*Du(e,t,n,r,o,i){let a=ue(n),s=le(t,n),l=n.time+s*n.slides,u=n.stackHeight*o/10;for(let d=n.time+bt;d<l;d+=bt){let m=ji(a,d,n.time,s,n.slides);yield Fe(e,{time:Math.trunc(d),x:m.x-u,y:i(m.y)-u,keys:r})}let c=ji(a,l,n.time,s,n.slides);return yield Fe(e,{time:l,x:c.x-u,y:i(c.y)-u,keys:r}),l+Br}function*Hu(e,t,n,r){let o=r,i=t.time,a=l=>({x:Dr+Math.cos(l)*An,y:Hr+Math.sin(l)*An});for(let l=t.time+bt;l<t.endTime;l+=bt){o+=(l-i)*Ni,i=l;let u=a(o);yield Fe(e,{time:Math.trunc(l),x:u.x,y:u.y,keys:n})}o+=(t.endTime-i)*Ni;let s=a(o);return yield Fe(e,{time:t.endTime,x:s.x,y:s.y,keys:n}),t.endTime+Br+1}function*Fr(e,t){let n=e.hitObjects;if(n.length===0)return;let r=t.circleRadiusPx,o=t.isHR?c=>384-c:c=>c,i={last:{time:n[0].time-1500,x:256,y:500,keys:0}};yield i.last;let a=0,s=-1/0,l=-1/0;for(let c=0;c<n.length;c++){let d=n[c],m=d.time;c>0&&m-s<Pu?a++:a=0,s=m;let f,h,p=0,b=d.type==="spinner";if(b){let g=En(i),v=g.x-Dr,x=g.y-Hr;p=v===0&&x===0?0:Math.atan2(x,v),f=Dr+Math.cos(p)*An,h=Hr+Math.sin(p)*An}else{let g=d,v=g.stackHeight*r/10;f=g.x-v,h=o(g.y)-v}yield*Ou(i,f,h,m,t.preemptMs,b,l);let S=a%2===0?Or:Wi;(En(i).keys&S)!==0&&(S=S===Or?Wi:Or),yield Fe(i,{time:m,x:f,y:h,keys:S}),d.type==="circle"?l=m+Br:d.type==="slider"?l=yield*Du(i,e,d,S,r,o):l=yield*Hu(i,d,S,p)}let u=En(i);yield Fe(i,{time:l,x:u.x,y:u.y,keys:0})}var Ui=Math.fround(1.4),Bu=Math.fround(1.65),Fu=100,Nu=2,Wu=4,ju=8;function Nr(e){return{isRim:(e&(Nu|ju))!==0,isStrong:(e&Wu)!==0}}function Uu(e,t,n,r){return e>5?n+(r-n)*(e-5)/5:e<5?n-(n-t)*(5-e)/5:n}function Vi(e,t){let n=500,r=1;for(let o of e.timingPoints){if(o.time>t)break;o.inherited?r=et(o.beatLength):(n=o.beatLength,r=1)}return{baseBeatLength:n,svMultiplier:r}}function $u(e,t){let{isRim:n,isStrong:r}=Nr(e.hitSound);return{kind:"hit",time:e.time,isRim:n,isStrong:r,hitSound:e.hitSound,sourceIndex:t,noteId:0}}function Vu(e,t,n){let r=e.endTime-e.time,o=Uu(n,3,5,7.5)*Bu,i=Math.max(1,Math.trunc(r/1e3*o));return{kind:"swell",time:e.time,endTime:e.endTime,requiredHits:i,hitSound:e.hitSound,sourceIndex:t}}function*Xu(e,t,n,r){let o=t.slides,i=t.length;i*=Ui,i*=o;let{baseBeatLength:a,svMultiplier:s}=Vi(e,t.time),l=a/s,c=Fu*(r*Ui)/e.sliderTickRate*e.sliderTickRate,d=Math.trunc(i/c*l);if(e.mode===1){yield $i(e,t,n,d);return}let f=c*(1e3/l);e.formatVersion>=8&&(l=a);let h=Math.min(l/e.sliderTickRate,d/o);if(h>0&&i/f*1e3<2*l){let b=t.time+d+h/8,S=0,g=Math.max(t.slides+1,t.edgeSounds.length);for(let v=t.time;v<=b;v+=h){let x=ht(t,S%g).hitSound,{isRim:k,isStrong:M}=Nr(x);yield{kind:"hit",time:v,isRim:k,isStrong:M,hitSound:x,sourceIndex:n,noteId:0},S++}return}yield $i(e,t,n,d)}function $i(e,t,n,r){let o=e.sliderTickRate===3?3:4,{baseBeatLength:i}=Vi(e,t.time),a=i/o,s=t.time,l=s+r,u=a>0?Math.max(0,Math.ceil(r/a+.5)):0;if(!Number.isSafeInteger(u)||!Number.isFinite(l))throw new Error("\u6EDA\u594F\u65F6\u95F4\u65E0\u6548");let{isStrong:c}=Nr(t.hitSound);return{kind:"drumroll",time:s,endTime:l,isStrong:c,hitSound:t.hitSound,tickCount:u,tickInterval:a,sourceIndex:n}}function Rn(e){let t=e.sliderMultiplier,n=e.overallDifficulty,r=[];for(let o=0;o<e.hitObjects.length;o++){let i=e.hitObjects[o];if(i)if(i.type==="circle")r.push($u(i,o));else if(i.type==="slider")for(let a of Xu(e,i,o,t))r.push(a);else i.type==="spinner"&&r.push(Vu(i,o,n))}r.sort((o,i)=>o.time-i.time);for(let o=0;o<r.length;o++){let i=r[o];i.kind==="hit"&&(i.noteId=o)}return r}var Pn=1,Wr=2,_n=4,jr=8,Xi=50,zu=50,Gu=[Pn,Wr,_n,jr];function Yu(e,t){return e.isRim?e.isStrong?Wr|jr:t?Wr:jr:e.isStrong?Pn|_n:t?Pn:_n}function*Ur(e,t){let n=Rn(e);if(n.length===0)return;let r=(i,a)=>({time:i,x:0,y:0,keys:a}),o=!0;yield r(n[0].time-1e3,0);for(let i=0;i<n.length;i++){let a=n[i],s=a.kind==="hit"?a.time:a.endTime;if(a.kind==="hit")yield r(a.time,Yu(a,o));else if(a.kind==="drumroll")for(let d=0;d<a.tickCount;d++){let m=a.time+d*a.tickInterval;m>a.endTime||(yield r(m,o?Pn:_n),o=!o)}else{let d=a.requiredHits,m=Math.min(zu,(a.endTime-a.time)/d);for(let f=0;f<d;f++)yield r(a.time+f*m,Gu[f%4])}let l=n[i+1],c=l===void 0||l.time>s+Xi?Xi:(l.time-s)*.9;yield r(s+c,0),o=!o}}function Ku(e){return Math.max(1,Math.round(e.circleSize))}function zi(e,t){let n=Math.floor(e*t/512);return n<0?0:n>=t?t-1:n}function Vt(e,t){let n=Ku(e),r=[{columns:n,firstColumnIndex:0}],o=[];for(let a=0;a<e.hitObjects.length;a++){let s=e.hitObjects[a];if(s===void 0||s.type!=="circle")continue;let l={kind:"note",time:s.time,column:zi(s.x,n),hitSound:s.hitSound,hitSample:s.hitSample,sourceIndex:a};o.push(l)}let i=e.hitObjects.length;for(let a=0;a<e.maniaHolds.length;a++){let s=e.maniaHolds[a],l={kind:"hold",startTime:s.time,endTime:s.endTime,column:zi(s.x,n),hitSound:s.hitSound,hitSample:s.hitSample,sourceIndex:i+a};o.push(l)}if(t?.isMirror)for(let a of o)a.column=n-1-a.column;return o.sort((a,s)=>{let l=a.kind==="note"?a.time:a.startTime,u=s.kind==="note"?s.time:s.startTime;return l!==u?l-u:a.column-s.column}),{stages:r,totalColumns:n,objects:o}}function Gi(e){let t=[];for(let i of e.timingPoints)i.inherited||t.push(i);if(t.length===0)return[];let n=0;for(let i of e.hitObjects){let a=i.type==="spinner"?i.endTime:i.time;a>n&&(n=a)}for(let i of e.maniaHolds)i.endTime>n&&(n=i.endTime);n+=2e3;let r=[],o=2e5;for(let i=0;i<t.length;i++){let a=t[i],s=i+1<t.length?t[i+1].time:n,l=a.beatLength,u=Math.max(1,a.meter);if(l<=0)continue;let c=0;for(let d=a.time;d<s;d+=l)if(r.push({time:d,major:c%u===0}),c++,r.length>=o)return r}return r}var Yi=20,qu=e=>e.kind==="note"?e.time:e.endTime,$r=e=>e.kind==="note"?e.time:e.startTime;function Vr(e,t){let{objects:n,totalColumns:r}=Vt(e,t);if(n.length===0)return[];let o=Array.from({length:r},()=>[]);for(let u of n)o[u.column]?.push(u);let i=[];for(let u of o)for(let c=0;c<u.length;c++){let d=u[c],m=u[c+1],f=qu(d),p=m===void 0||$r(m)>f+Yi?Yi:($r(m)-f)*.9;i.push({time:$r(d),column:d.column,press:!0}),i.push({time:f+p,column:d.column,press:!1})}i.sort((u,c)=>u.time-c.time);let a=[],s=0,l=0;for(;l<i.length;){let u=i[l].time;for(;l<i.length&&i[l].time===u;){let c=i[l];c.press?s|=1<<c.column:s&=~(1<<c.column),l++}a.push({time:u,x:s,y:0,keys:0})}return a}var Ju=100,Ki=512,Zu=-36,Qu=1e5;function Xt(e,t,n){return Math.max(t,Math.min(n,e))}function On(e){return Math.fround((1-.7*(e-5)/5)/2)}var ed=106.75,td=.8;function gt(e){let t=Math.abs(On(e)*2);return Math.fround(ed*t*td)}function nd(e,t){let n=e.timingPoints.find(a=>!a.inherited),r=n?n.beatLength:500,o=1,i=!0;for(let a of e.timingPoints){if(a.time>t)break;a.inherited?o=et(a.beatLength):(r=a.beatLength,o=1),i=!Number.isNaN(a.beatLength)}return{baseBeatLength:r,svMultiplier:o,generateTicks:i}}function rd(e,t){let n=-100/t,r=n<0?Xt(Math.fround(-n),10,1e3)/100:1;return e*r}function Xr(e,t){let n=ue(e);if(n.length===0)return 0;let r=e.x;if(n.length===1)return n[0].x-r;let i=Xt(t,0,1)*(n.length-1),a=Math.floor(i),s=Math.min(a+1,n.length-1),l=i-a;return n[a].x+(n[s].x-n[a].x)*l-r}function*od(e,t,n,r,o,i){let a=Math.min(Qu,o),s=Xt(r,0,a),l=n*10;yield{type:"head",time:e,pathProgress:0};for(let f=0;f<i;f++){let h=e+f*t,p=f%2===1,b=[];if(s!==0)for(let S=s;S<=a&&!(S>=a-l);S+=s){let g=S/a,v=p?1-g:g;b.push({type:"tick",time:h+v*t,pathProgress:g})}p&&b.reverse(),yield*b,f<i-1&&(yield{type:"repeat",time:h+t,pathProgress:(f+1)%2})}let u=i*t,c=e+(i-1)*t,d=Math.max(e+u/2,c+t+Zu),m=(d-c)/t;i%2===0&&(m=1-m),yield{type:"legacyLastTick",time:d,pathProgress:m},yield{type:"tail",time:e+u,pathProgress:i%2}}function Ln(e,t,n,r,o,i,a){let s=Math.fround(n);return{type:e,startTime:t,originalX:s,xOffset:0,effectiveX:Math.fround(Xt(s,0,Ki)),scale:r,sourceIndex:o,indexInBeatmap:i,hitSound:a,hyperDash:!1,distanceToHyperDash:0}}function id(e,t,n,r){return Ln("fruit",e.time,e.x,r,t,n,e.hitSound)}function*ad(e,t,n,r,o){let{baseBeatLength:i,svMultiplier:a,generateTicks:s}=nd(e,t.time),l=rd(i,a),u=Ju*e.sliderMultiplier/l,c=u*i,d=e.formatVersion<8?1/a:1,m=s?c/e.sliderTickRate*d:0,f=t.slides,h=t.length,p=h/u,b=od(t.time,p,u,m,h,f),S=Math.fround(Xt(t.x,0,Ki)),g=null;for(let v of b){if(g!==null){let x=Math.trunc(v.time)-Math.trunc(g.time);if(x>80){let k=x;for(;k>100;)k/=2;for(let M=k;M<x;M+=k){let y=g.pathProgress+M/x*(v.pathProgress-g.pathProgress);yield Ln("tinyDroplet",M+g.time,S+Xr(t,y),o,n,r,t.hitSound)}}}g=v,v.type==="tick"?yield Ln("droplet",v.time,S+Xr(t,v.pathProgress),o,n,r,t.hitSound):(v.type==="head"||v.type==="tail"||v.type==="repeat")&&(yield Ln("fruit",v.time,S+Xr(t,v.pathProgress),o,n,r,t.hitSound))}}function*sd(e,t,n,r){let o=Math.trunc(e.time),i=Math.trunc(e.endTime),a=Math.fround(e.endTime-e.time);for(;a>100;)a=Math.fround(a/2);if(a<=0)return;let s=0,l=o,u=!1;for(;l<=i;){yield{type:"banana",startTime:l,originalX:0,xOffset:0,effectiveX:0,scale:r,sourceIndex:t,indexInBeatmap:n,hitSound:e.hitSound,bananaIndex:s,hyperDash:!1,distanceToHyperDash:0},s++;let c=Math.fround(l+a);c<=l&&(u=!0),l=u?l+a:c}}function zt(e,t){let n=On(t.cs),r=[],o=0;for(let i=0;i<e.hitObjects.length;i++){let a=e.hitObjects[i];if(a){if(a.type==="circle")r.push(id(a,i,o,n)),o++;else if(a.type==="slider"){for(let s of ad(e,a,i,o,n))r.push(s);o++}else if(a.type==="spinner"){for(let s of sd(a,i,o,n))r.push(s);o++}}}return r}var ld=256,cd=1,zr=.5;function Gr(e,t){if(e.length===0)return[];let n=[],r=(s,l,u=!1)=>{n.push({time:s,x:l,y:0,keys:u?1:0})},o=Math.fround(gt(t.cs)*.5),i=ld,a=0;for(let s of e){let l=s.effectiveX,u=Math.abs(i-l),c=s.startTime-a;if(c<0)continue;let d=u===0?0:u/c,m=d>zr,f=d>cd;if(i-o<l&&i+o>l){a=s.startTime,r(s.startTime,i);continue}if(f)r(s.startTime,l);else if(s.hyperDash)r(s.startTime-c,i),r(s.startTime,l);else if(m){let b=(u/zr-c)/2,S=Math.fround(Math.fround(b)/c),g=Math.fround(i+(l-i)*S);r(s.startTime-c+1,i,!0),r(s.startTime-c+b,g),r(s.startTime,l)}else{let h=u/zr;r(s.startTime-h,i),r(s.startTime,l)}a=s.startTime,i=l}return n}var yt=class yt{constructor(t=1337){A(this,"x");A(this,"y",842502087);A(this,"z",3579807591);A(this,"w",273326509);A(this,"bitBuffer",0);A(this,"bitIndex",32);this.x=t>>>0}nextUInt(){let t=(this.x^this.x<<11)>>>0;return this.x=this.y,this.y=this.z,this.z=this.w,this.w=(this.w^this.w>>>19^(t^t>>>8))>>>0,this.w}next(){return(yt.INT_MASK&this.nextUInt())>>>0}nextDouble(){return yt.INT_TO_REAL*this.next()}nextIntRange(t,n){return Math.trunc(t+this.nextDouble()*(n-t))}nextDoubleRange(t,n){return Math.trunc(t+this.nextDouble()*(n-t))}nextBool(){return this.bitIndex===32?(this.bitBuffer=this.nextUInt(),this.bitIndex=1,(this.bitBuffer&1)===1):(this.bitIndex++,this.bitBuffer=this.bitBuffer>>>1,(this.bitBuffer&1)===1)}};A(yt,"INT_TO_REAL",1/2147483648),A(yt,"INT_MASK",2147483647);var Dn=yt;var tt=512,ud=1337,dd=.8,md=1;function Yr(e,t,n){return Math.max(t,Math.min(n,e))}function Gt(e,t,n){let r=new Dn(ud),o=n.isHR,i=null,a=0,s=0;for(;s<e.length;){let l=e[s].sourceIndex,u=s;for(;u<e.length&&e[u].sourceIndex===l;)u++;let c=t.hitObjects[l];if(c?.type==="circle"){let d=e[s];if(d.xOffset=0,o){let m=fd(d,i,a,r);i=m.lastPosition,a=m.lastStartTime}}else if(c?.type==="spinner")for(let d=s;d<u;d++){let m=e[d];m.xOffset=Math.fround(r.nextDouble()*tt),r.next(),r.next(),r.next()}else if(c?.type==="slider"){let d=c.curvePoints;i=Math.fround(d[d.length-1].x),a=c.time;for(let m=s;m<u;m++){let f=e[m];f.xOffset=0,f.type==="tinyDroplet"?f.xOffset=Math.fround(Yr(r.nextIntRange(-20,20),-f.originalX,tt-f.originalX)):f.type==="droplet"&&r.next()}}s=u}for(let l of e)l.effectiveX=Math.fround(Yr(l.originalX+l.xOffset,0,tt));if(bd(e,n.cs),n.isMirror)for(let l of e)l.effectiveX=Math.fround(tt-l.effectiveX),l.hyperDashTargetX!==void 0&&(l.hyperDashTargetX=Math.fround(tt-l.hyperDashTargetX))}function fd(e,t,n,r){let o=e.originalX,i=e.startTime;if(t===null||t===0)return{lastPosition:o,lastStartTime:i};let a=Math.fround(o-t),s=Math.trunc(i-n);return s>1e3?{lastPosition:o,lastStartTime:i}:a===0?(o=pd(o,s/4,r),e.xOffset=Math.fround(o-e.originalX),{lastPosition:t,lastStartTime:n}):(Math.abs(a)<Math.trunc(s/3)&&(o=hd(o,a)),e.xOffset=Math.fround(o-e.originalX),{lastPosition:o,lastStartTime:i})}function pd(e,t,n){let r=n.nextBool(),o=Math.min(20,Math.fround(n.nextDoubleRange(0,Math.max(0,t))));return r?e+o<=tt?e+=o:e-=o:e-o>=0?e-=o:e+=o,Math.fround(e)}function hd(e,t){return t>0?e+t<tt&&(e+=t):e+t>0&&(e+=t),Math.fround(e)}function bd(e,t){let n=e.filter(a=>a.type==="fruit"||a.type==="droplet").sort((a,s)=>a.startTime-s.startTime),r=gt(t)/2;r/=dd;let o=0,i=r;for(let a=0;a<n.length-1;a++){let s=n[a],l=n[a+1];s.hyperDash=!1,s.hyperDashTargetX=void 0,s.distanceToHyperDash=0;let u=l.effectiveX>s.effectiveX?1:-1,c=Math.trunc(l.startTime)-Math.trunc(s.startTime)-1e3/60/4,d=Math.abs(l.effectiveX-s.effectiveX)-(o===u?i:r),m=Math.fround(c*md-d);m<0?(s.hyperDash=!0,s.hyperDashTargetX=l.effectiveX,i=r):(s.distanceToHyperDash=m,i=Yr(m,0,r)),o=u}}function qi(e,t,n,r,o,i){if(i<0||i>=160||!Number.isFinite(i)||r<=0)return;let a=r*3/64;e.save(),e.globalCompositeOperation="source-over",e.globalAlpha*=.6*(1-i/160),e.strokeStyle=o,e.lineWidth=a,e.beginPath(),e.arc(t,n,r*59/64-a/2,0,Math.PI*2),e.stroke(),e.restore()}function Ji(e,t,n,r,o,i,a,s){if(!r)return;let l=(u,c,d)=>{let m=n-t[c];if(!Number.isFinite(m)||m<0||m>=60)return;let f=r.get(`${u}@2x.png`)??r.get(`${u}.png`);!f||f.width<=1||f.height<=1||(e.save(),e.globalCompositeOperation="source-over",e.globalAlpha*=1-m/60,e.translate(o+(d?a:0),i),d&&e.scale(-1,1),e.drawImage(f,0,0,a/2,s),e.restore())};l("taiko-drum-outer","LeftRim",!1),l("taiko-drum-inner","LeftCentre",!1),l("taiko-drum-outer","RightRim",!0),l("taiko-drum-inner","RightCentre",!0)}function Zi(e,t,n,r,o,i){if(e.length<2||!Number.isFinite(t)||t<=0||!Number.isFinite(o)||o<=0)return null;let a=e.map(x=>i(x.x,x.y)),s=1/0,l=1/0,u=-1/0,c=-1/0;for(let[x,k]of a){if(!Number.isFinite(x)||!Number.isFinite(k))return null;s=Math.min(s,x),l=Math.min(l,k),u=Math.max(u,x),c=Math.max(c,k)}let d=t+2,m=Math.floor(s-d),f=Math.floor(l-d),h=Math.ceil(u+d)-m,p=Math.ceil(c+d)-f,b=new OffscreenCanvas(Math.ceil(h*o),Math.ceil(p*o)),S=b.getContext("2d");if(!S)throw new Error("\u65E0\u6CD5\u51C6\u5907\u6ED1\u6761\u753B\u9762");S.scale(o,o),S.beginPath(),S.moveTo(Math.fround(a[0][0])-m,Math.fround(a[0][1])-f);for(let[x,k]of a.slice(1))S.lineTo(Math.fround(x)-m,Math.fround(k)-f);S.lineCap="round",S.lineJoin="round";let g=t*59/64,v=t*3/64;return S.lineWidth=g*2,S.strokeStyle=n,S.stroke(),S.lineWidth=(g-v)*2,S.strokeStyle=r,S.stroke(),{bmp:b,ox:m,oy:f,w:h,h:p}}function Qi(e){return ue(e)}function ea(e,t,n,r,o){let i=t-n,a=Math.max(0,Math.min(o,i/r)),s=Math.min(Math.floor(a),o-1),l=a-s;return s%2===1&&(l=1-l),gd(e,l)}function gd(e,t){if(e.length===0)return{x:0,y:0};if(t<=0||e.length===1)return{...e[0]};if(t>=1)return{...e[e.length-1]};let n=t*(e.length-1),r=Math.floor(n),o=Math.min(r+1,e.length-1),i=n-r;return{x:e[r].x+(e[o].x-e[r].x)*i,y:e[r].y+(e[o].y-e[r].y)*i}}var Kr=256,qr=192,ta=400,yd=3;function ia(e,t){if(e.times.length===0)return{cumAngle:0,absAngle:0};if(t<=e.times[0])return{cumAngle:0,absAngle:0};let n=0,r=e.times.length-1;for(;n<r;){let o=n+r+1>>1;e.times[o]<=t?n=o:r=o-1}return{cumAngle:e.cumAngles[n],absAngle:e.absAngles[n]}}function Jr(e,t,n,r){let o=Math.fround(e);return o>5?n+(r-n)*(o-5)/5:o<5?n-(n-t)*(5-o)/5:n}function Zr(e,t){return Math.floor(t/1e3*Jr(e,3,5,7.5))}function Bn(e,t){return Math.floor(t/1e3*Jr(e,1.5,2.5,3.75)+1e-4)}function Sd(e,t){let n=Jr(e,250,380,430)/60,r=Math.floor(t/1e3*n+1e-4);return Math.max(0,r-Bn(e,t)-2)}function vd(e,t,n,r,o){let i=[];if(o){let a=Bn(n,r),s=a+2+Sd(n,r),l=a+3;for(let u=0;u<t.length&&l<=s;u++){let c=Math.floor(t[u]/(2*Math.PI));for(;l<=c&&l<=s;)i.push(e[u]),l++}}else{let a=Zr(n,r),s=1;for(let l=0;l<t.length;l++){let u=Math.floor(t[l]/Math.PI);for(;s<=u;)s>a+3&&(s-(a+3))%2===0&&i.push(e[l]),s++}}return i}function aa(e,t,n,r){if(r){let i=Bn(e,t);return i===0?1:Math.min(1,n/(2*Math.PI)/i)}let o=Zr(e,t);return o===0?1:Math.min(1,n/Math.PI/o)}function wd(e,t,n,r){if(r){let a=Bn(e,t);if(a===0)return 300;let s=n/(2*Math.PI)/a;return s>=1?300:s>=.9?100:s>=.75?50:0}let o=Zr(e,t);if(o===0)return 300;let i=n/Math.PI;return i>=o+1?300:i>=o-1?100:i>=Math.floor(o/4)?50:0}var Yt=2*Math.PI;function xd(){let e=0,t=0,n=0,r=0;return{report(o){e+=o;let i=e-t;for(n=Math.max(n,Math.abs(i));n>=Yt;){let a=Math.sign(i)||1;r++,t+=a*Yt,i=e-t,n=Math.abs(i)}},total(){return Yt*r+n}}}function Md(e,t,n,r,o,i){let a=[],s=[],l=[],u=xd(),c=null,d=0,m=0,f=(S,g,v)=>{let x=g-Kr,k=v-qr;if(x*x+k*k>=25){let M=Math.atan2(k,x);if(c!==null){let y=M-c;for(;y-d>Math.PI;)y-=Yt;for(;y-d<-Math.PI;)y+=Yt;d=y;let w=y*i;m+=w,u.report(w)}c=M}a.push(S),s.push(m),l.push(u.total())},h=Hn(t,n,e.time);f(e.time,h.x,h.y);for(let S=0;S<t.length;S++){let g=n[S];if(g<=e.time)continue;if(g>=e.endTime)break;let v=t[S];f(g,v.x,v.y)}let p=Hn(t,n,e.endTime);f(e.endTime,p.x,p.y);let b=vd(a,l,r,e.endTime-e.time,o);return{times:a,cumAngles:s,absAngles:l,bonusTimes:b}}function Td(e){let t=new Array(e.length),n=0;for(let r=0;r<e.length;r++)n+=e[r].timeDelta,t[r]=n;return t}var na=5,ra=10;function Cd(e,t){let n=[],r=0;for(let o=0;o<e.length;o++){let i=e[o],a=i.keys&15,s=(r&na)===0&&(a&na)!==0,l=(r&ra)===0&&(a&ra)!==0;s&&n.push({timeMs:t[o],x:i.x,y:i.y}),l&&n.push({timeMs:t[o],x:i.x,y:i.y}),r=a}return n}function kd(e){let t=new Array(e.length+1);t[e.length]=1/0;for(let n=e.length-1;n>=0;n--)t[n]=Math.min(e[n].timeMs,t[n+1]);return t}function Id(e,t,n){let r=t;for(;r<e.length;){let o=e[r];if(!(o.type==="circle"?o.headResolved:n>=o.endTime))break;r++}return r}function Hn(e,t,n){if(e.length===0)return{x:0,y:0};let r=e.length-1;if(n<=t[0])return{x:e[0].x,y:e[0].y};if(n>=t[r])return{x:e[r].x,y:e[r].y};let o=0,i=r-1;for(;o<i;){let d=o+i+1>>1;t[d]<=n?o=d:i=d-1}let a=t[o],s=t[o+1],l=s>a?(n-a)/(s-a):0,u=e[o],c=e[o+1];return{x:u.x+(c.x-u.x)*l,y:u.y+(c.y-u.y)*l}}function oa(e,t,n){if(e.length===0)return!1;let r=e.length-1;if(n<=t[0])return(e[0].keys&15)!==0;if(n>=t[r])return(e[r].keys&15)!==0;let o=0,i=r;for(;o<i;){let a=o+i+1>>1;t[a]<=n?o=a:i=a-1}return(e[o].keys&15)!==0}function Ed(e,t){if(e.length===0)return{x:0,y:0};if(t<=0||e.length===1)return{...e[0]};if(t>=1)return{...e[e.length-1]};let n=t*(e.length-1),r=Math.floor(n),o=Math.min(r+1,e.length-1),i=n-r;return{x:e[r].x+(e[o].x-e[r].x)*i,y:e[r].y+(e[o].y-e[r].y)*i}}function Ad(e,t,n,r,o){let i=t-n,a=Math.max(0,Math.min(o,i/r)),s=Math.min(Math.floor(a),o-1),l=a-s;return s%2===1&&(l=1-l),Ed(e,l)}function sa(e,t,n){let r=n.od,o=n.isLazer&&!n.lzLegacyNotelock,i=n.isLazer&&!n.lzNoSliderAcc,a=o?n.hitWindow300U:n.hitWindow300,s=o?n.hitWindow100U:n.hitWindow100,l=o?n.hitWindow50U:n.hitWindow50,u=n.circleRadiusPx,c=u*u,d=n.isHR?y=>384-y:y=>y,m=Td(t.frames),f=Cd(t.frames,m),h=new Map,p=new Array(e.hitObjects.length);for(let y=0;y<e.hitObjects.length;y++){let w=e.hitObjects[y];if(w.type==="spinner")h.set(y,Md(w,t.frames,m,n.od,n.isLazer,n.speed)),p[y]={type:"spinner",startTime:w.time,endTime:w.endTime,x:Kr,y:qr,headResolved:!0,headHit:!0,headPressTime:w.endTime,headJudgement:0};else if(w.type==="circle"){let T=w.stackHeight*u/10;p[y]={type:"circle",startTime:w.time,endTime:w.time,x:w.x-T,y:d(w.y)-T,headResolved:!1,headHit:!1,headPressTime:0,headJudgement:0}}else{let T=w.stackHeight*u/10,C=le(e,w);p[y]={type:"slider",startTime:w.time,endTime:w.time+C*w.slides,x:w.x-T,y:d(w.y)-T,headResolved:!1,headHit:!1,headPressTime:0,headJudgement:0}}}let b=0,S=0,g=kd(f);for(let y=0;y<f.length;y++){let w=f[y];for(;b<p.length;){let _=p[b];if(_.type==="spinner"||_.headResolved){b++;continue}let P=_.type==="slider"&&!n.isLazer?Math.min(_.startTime+l,_.endTime):_.startTime+l;if(P<w.timeMs){_.headResolved=!0,_.headHit=!1,_.headJudgement=0,_.headPressTime=P,b++;continue}break}let T=-1;for(let _=b;_<p.length;_++){let P=p[_];if(P.startTime>w.timeMs+ta)break;if(P.type==="spinner"||P.headResolved)continue;let U=w.x-P.x,H=w.y-P.y;if(!(U*U+H*H>c)){T=_;break}}if(T<0)continue;let C=p[T],E=!1;if(o){let _=null;for(let P=T-1;P>=0;P--){let U=p[P];if(U.type!=="spinner"){_=U;break}}_!==null&&!_.headHit&&w.timeMs<_.startTime&&(E=!0)}else{S=Id(p,S,g[y]);for(let _=S;_<T;_++){let P=p[_];if((P.type==="circle"?!P.headResolved:w.timeMs<P.endTime)&&P.endTime+yd<C.startTime){E=!0;break}}}if(!E&&Math.abs(w.timeMs-C.startTime)>=ta&&(E=!0),E)continue;let R=Math.abs(w.timeMs-C.startTime),D;if(o?R<=a?D=300:R<=s?D=100:R<=l?D=50:D=0:R<a?D=300:R<s?D=100:R<l?D=50:D=0,C.headResolved=!0,C.headHit=D!==0,C.headJudgement=D,C.headPressTime=w.timeMs,o&&D!==0)for(let _=b;_<T;_++){let P=p[_];P.type==="spinner"||P.headResolved||(P.headResolved=!0,P.headHit=!1,P.headJudgement=0,P.headPressTime=w.timeMs)}}for(let y of p)y.type==="spinner"||y.headResolved||(y.headResolved=!0,y.headHit=!1,y.headJudgement=0,y.headPressTime=y.startTime+l);let v=[],x=[],k=0,M=-1/0;for(let y=0;y<e.hitObjects.length;y++){let w=e.hitObjects[y],T=p[y];if(w.type==="spinner"){let $=w.endTime-w.time,ee=h.get(y),ve=ee.absAngles.length>0?ee.absAngles[ee.absAngles.length-1]:0,fe=wd(r,$,ve,n.isLazer);v.push({objectIndex:y,judgement:fe,time:w.endTime,x:Kr,y:qr,hitSound:w.hitSound,comboBreak:fe===0,spinnerTotalRad:ve,spinnerBonusTimes:ee.bonusTimes});continue}if(w.type==="circle"){v.push({objectIndex:y,judgement:T.headJudgement,time:T.headPressTime,x:T.x,y:T.y,hitSound:w.hitSound??0,comboBreak:T.headJudgement===0});continue}let C=w,E=le(e,C),R=n.isLazer?Qi(C):ue(C),D=u*u,_=(2.4*u)**2,P=C.time+E*C.slides,U=E*C.slides,H=Math.min(36,U/2),I=C.stackHeight*u/10,B=T.headHit,j=2,K=-1/0,V=B?1:0,G=!1,F=null,L=$=>{let ee=n.isLazer?ea(R,$,C.time,E,C.slides):Ad(R,$,C.time,E,C.slides);return{x:ee.x-I,y:d(ee.y)-I}},N=($,ee,ve,fe)=>{let De=G;if(!fe)G=!1;else{let $e=L($),wn=ee-$e.x,xn=ve-$e.y,ie=wn*wn+xn*xn;G=G?ie<=_:ie<=D}!De&&G?F=$:De&&!G&&F!==null&&(x.push({start:F,end:$}),F=null)},O=C.time>=M?k:0;for(;O<t.frames.length&&m[O]<C.time;)O++;k=O,M=C.time;for(let $ of Pi(e,C,E,n.isLazer)){if($.kind==="tail")break;for(j++,K=$.t;O<t.frames.length&&m[O]<$.t;){let $e=t.frames[O];N(m[O],$e.x,$e.y,($e.keys&15)!==0),O++}let ee=Hn(t.frames,m,$.t),ve=oa(t.frames,m,$.t);N($.t,ee.x,ee.y,ve);let fe=G;fe&&V++;let De=L($.t);v.push({objectIndex:y,judgement:fe?300:0,time:$.t,x:De.x,y:De.y,hitSound:0,comboBreak:!fe&&B,isSliderSub:!0})}let W=Math.max(P-H,K);for(;O<t.frames.length&&m[O]<W;){let $=t.frames[O];N(m[O],$.x,$.y,($.keys&15)!==0),O++}{let $=Hn(t.frames,m,W),ee=oa(t.frames,m,W);N(W,$.x,$.y,ee)}let Q=G;Q&&V++,F!==null&&(x.push({start:F,end:P}),F=null);let se=L(W);v.push({objectIndex:y,judgement:Q?300:0,time:P,x:se.x,y:se.y,hitSound:0,comboBreak:!1,isSliderSub:!0,...i?{accMax:150}:{}});let J;i?J=T.headJudgement:V===j?J=300:V===0?J=0:V/j>=.5?J=100:J=50;let Se=L(P);v.push({objectIndex:y,judgement:J,time:T.headPressTime,displayTime:P,x:Se.x,y:Se.y,hitSound:C.hitSound??0,comboBreak:!B})}return{results:v,spinnerAngles:h,trackingIntervals:x}}var Ca='system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif',Rd=256,Pd=192,ka=512,Ia=384,Wn=1280,nt=720,Kt=Math.min(800/ka,600/Ia)*.9,_d=(Wn-ka*Kt)/2,Ld=(nt-Ia*Kt)/2;function rt(e,t){return[_d+e*Kt,Ld+t*Kt]}var la=new WeakMap;function Ea(e){let t=la.get(e);if(t!==void 0)return t;let n=64,o=new OffscreenCanvas(n,n).getContext("2d");o.drawImage(e,0,0,n,n);let{data:i}=o.getImageData(0,0,n,n),a=n/2,s=0;for(let u=0;u<n;u++)for(let c=0;c<n;c++)if(i[(u*n+c)*4+3]>64){let d=c+.5-a,m=u+.5-a,f=Math.sqrt(d*d+m*m);f>s&&(s=f)}let l=Math.min(1,Math.max(.5,s/a));return la.set(e,l),l}var ca=new WeakMap;function Ne(e){let t=ca.get(e);if(t!==void 0)return t;let n;if(e.width<=1||e.height<=1)n=!0;else{let i=new OffscreenCanvas(32,32).getContext("2d");i.drawImage(e,0,0,32,32);let{data:a}=i.getImageData(0,0,32,32);n=!0;for(let s=3;s<a.length;s+=4)if(a[s]>64){n=!1;break}}return ca.set(e,n),n}function eo(e){let t=`${e.config.hitCirclePrefix.toLowerCase()}-`;for(let[n,r]of e.images){let o=n.toLowerCase();o.startsWith("hitcircle")||o.startsWith("sliderstartcircle")||o.startsWith("pippidon")?Ne(r):o.startsWith(t)&&(Ea(r),Ne(r))}}function ua(e,t){return e.get(`${t}@2x.png`)??e.get(`${t}.png`)}function Te(e,t){let n=e.get(`${t}@2x.png`);if(n!==void 0)return{bmp:n,scale:2};let r=e.get(`${t}.png`);if(r!==void 0)return{bmp:r,scale:1}}var Od=128;function We(e,t){return e.bmp.width/e.scale/Od*(2*t)}var da=new WeakMap;function qt(e,t){let n=da.get(e);n===void 0&&(n=new Map,da.set(e,n));let r=n.get(t);if(r!==void 0)return r;let{width:o,height:i}=e,a=new OffscreenCanvas(o,i),s=a.getContext("2d");return s.drawImage(e,0,0),s.globalCompositeOperation="multiply",s.fillStyle=t,s.fillRect(0,0,o,i),s.globalCompositeOperation="destination-in",s.drawImage(e,0,0),n.set(t,a),a}var ma=new WeakMap;function fa(e,t){if(!t)return ue(e);let n=ma.get(e);return n===void 0&&(n=ue(e).map(o=>({x:o.x,y:384-o.y})),ma.set(e,n)),n}var Qr=240,pa=Qr,Dd=["#e879a0","#68b3f0","#f7e04a","#90e070","#f08040"];function Hd(e){let t=new Array(e.hitObjects.length),n=-1;for(let r=0;r<e.hitObjects.length;r++){let o=e.hitObjects[r],i=o.type!=="spinner"&&(r===0||o.newCombo),a=o.type!=="spinner"?o.comboSkip:0;i&&(n+=1+a),t[r]=Math.max(0,n)}return t}function Bd(e){let t=new Array(e.hitObjects.length),n=0;for(let r=0;r<e.hitObjects.length;r++){let o=e.hitObjects[r];if(o.type==="spinner"){t[r]=0;continue}r===0||o.newCombo?n=1:n++,t[r]=n}return t}var ha=new WeakMap;function Fd(e){let t=ha.get(e);return t===void 0&&(t={indices:Hd(e),numbers:Bd(e)},ha.set(e,t)),t}var ba=new WeakMap;function Nd(e){let t=ba.get(e);if(t!==void 0)return t;let n=500;for(let r of e.hitObjects){let o=500;r.type==="slider"?o=le(e,r)*r.slides+500:r.type==="spinner"&&(o=r.endTime-r.time+500),o>n&&(n=o)}return ba.set(e,n),n}var ga=new WeakMap;function Wd(e){let t=ga.get(e);if(t===void 0){t=new Set;for(let n of e)!n.isSliderSub&&n.judgement>0&&t.add(n.objectIndex);ga.set(e,t)}return t}function jd(e,t,n,r){let o=e.hitObjects,i=o.length;if(i===0)return{firstIdx:0,lastIdx:-1};let a=t-r,s=t+n,l=0,u=i;for(;l<u;){let d=l+u>>>1;o[d].time<a?l=d+1:u=d}let c=l;if(c>=i||o[c].time>s)return{firstIdx:c,lastIdx:c-1};for(l=c,u=i-1;l<u;){let d=l+u+1>>>1;o[d].time<=s?l=d:u=d-1}return{firstIdx:c,lastIdx:l}}function ya(e,t,n){let r=t+n*.4,o=t+n*.7;return e<r?(e-t)/(n*.4):e<o?1-(e-r)/(n*.3):0}function Ud(e,t,n,r){let o=t+n*.4;if(e<t)return 0;if(e<o)return(e-t)/(n*.4);if(e>=r)return 0;let i=Math.min(1,(e-o)/(r-o));return 1-i*(2-i)}var $d=[],Vd=[],Xd=[];function Aa(e,t,n,r,o=[],i=new Map,a,s=1){let l=a.preemptMs,u=a.fadeInMs,c=a.circleRadiusPx*Kt,d=a.isHR?H=>384-H:H=>H,m=a.isHD,f=0;if(m){for(let H=0;H<t.hitObjects.length;H++)if(t.hitObjects[H].type!=="spinner"){f=H;break}}let{beatLength:h,tpTime:p}=Qd(t.timingPoints,r),b=n.config.comboColors.length>0?n.config.comboColors:Dd,{indices:S,numbers:g}=Fd(t),v=ua(n.images,"hitcircle"),x=v!==void 0&&Ne(v),k=ua(n.images,"sliderstartcircle"),M=k!==void 0?Ne(k):x,y=Wd(o),w=240,T=200,C=a.hitWindow100,E=a.hitWindow50,R=$d;R.length=0;let{firstIdx:D,lastIdx:_}=jd(t,r,l,Nd(t));for(let H=D;H<=_;H++){let I=t.hitObjects[H],B=b[S[H]%b.length],j=I.time,K=j-l;if(r<K)continue;let V=I.type==="slider"?le(t,I):0,G=(I.type==="circle"||I.type==="slider")&&y.has(H),F;if(m&&I.type==="circle"?F=K+l*.7:I.type==="slider"?F=j+V*I.slides+w:I.type==="spinner"?F=I.endTime+T:G?F=j+pa:F=j+E,r>F)continue;let L;if(m&&I.type==="circle")L=ya(r,K,l);else if(m&&I.type==="slider")r<=j+V*I.slides?L=1:L=1-(r-(j+V*I.slides))/w;else if(r<j){let W=r-K;L=Math.min(1,W/Math.min(u,l))}else if(I.type==="slider"&&r<=j+V*I.slides)L=1;else if(I.type==="spinner"&&r<=I.endTime)L=1;else if(G&&I.type==="circle")L=1;else if(I.type==="circle")if(r<j+C)L=1;else{let W=Math.max(1,E-C);L=1-(r-j-C)/W}else{let W=I.type==="slider"?j+V*I.slides:I.endTime,Q=I.type==="slider"?w:T;L=1-(r-W)/Q}let N=I.type==="slider"?j+V*I.slides:0,O=I.type==="spinner"?Number.POSITIVE_INFINITY:j;R.push({index:H,color:B,alpha:Math.max(0,Math.min(1,L)),slideDur:V,comboNumber:g[H],wasHit:G,bodyDepth:N,frontDepth:O})}let P=Vd,U=Xd;P.length=0,U.length=0;for(let H=0;H<R.length;H++)t.hitObjects[R[H].index].type==="slider"&&P.push(H),U.push(H);P.sort((H,I)=>R[I].bodyDepth-R[H].bodyDepth),U.sort((H,I)=>R[I].frontDepth-R[H].frontDepth);for(let H of P){let{index:I,alpha:B,slideDur:j,color:K}=R[H],V=t.hitObjects[I];if(V.type!=="slider")continue;e.save(),e.globalAlpha=B;let G=V.stackHeight??0;G!==0&&e.translate(-G*c/10,-G*c/10);let F=fa(V,a.isHR),L=V.time,N=V.time+j*V.slides;m&&(e.globalAlpha=Math.max(0,Ud(r,L-l,l,N)));let O=n.config.sliderTrackOverride??K;if(Gd(e,V,F,c,n.config.sliderBorder,O,a.isHR,s),V.slides>1&&F.length>=2){let W=Math.min(4,F.length-2),Q=F[F.length-1],se=F[F.length-1-W],[J,Se]=rt(Q.x,Q.y);if(Kd(V.slides,r,L,j)){let $=Math.atan2(se.y-Q.y,se.x-Q.x);Ta(e,J,Se,$,c,K,n.images,r,p,h)}if(r>=L&&qd(V.slides,r,L,j)){let $=F[W],ee=F[0],[ve,fe]=rt(ee.x,ee.y),De=Math.atan2($.y-ee.y,$.x-ee.x);Ta(e,ve,fe,De,c,K,n.images,r,p,h)}}e.restore()}for(let H of U){let{index:I,color:B,alpha:j,slideDur:K,comboNumber:V,wasHit:G}=R[H],F=t.hitObjects[I];e.save(),e.globalAlpha=j;let L=F.type!=="spinner"?F.stackHeight??0:0;if(L!==0&&e.translate(-L*c/10,-L*c/10),F.type==="circle"){let[N,O]=rt(F.x,d(F.y));if(m){if(j>0&&(Sa(e,N,O,c,B,n.images),Nn(e,N,O,c,V,n,x),r<F.time&&I===f)){let W=(F.time-r)/l;Fn(e,N,O,c*(1+2*W),B,n.images)}}else if(G&&r>=F.time){let W=r-F.time,Q=Math.max(0,1-W/Qr);e.globalAlpha=Q,wa(e,N,O,c,B,n.images,W)}else if(Sa(e,N,O,c,B,n.images),r<F.time){Nn(e,N,O,c,V,n,x);let W=(F.time-r)/l;Fn(e,N,O,c*(1+2*W),B,n.images)}}else if(F.type==="slider"){let N=fa(F,a.isHR),[O,W]=rt(F.x,d(F.y)),Q=F.time,se=F.time+K*F.slides;if(r<F.time)if(m){let J=ya(r,F.time-l,l);if(J>0){if(e.save(),e.globalAlpha=J,va(e,O,W,c,B,n.images),Nn(e,O,W,c,V,n,M),I===f){let Se=(F.time-r)/l;Fn(e,O,W,c*(1+2*Se),B,n.images)}e.restore()}}else{va(e,O,W,c,B,n.images),Nn(e,O,W,c,V,n,M);let J=(F.time-r)/l;Fn(e,O,W,c*(1+2*J),B,n.images)}if(!m&&G&&r>=F.time&&r<F.time+pa){let J=r-F.time,Se=Math.max(0,1-J/Qr);e.save(),e.globalAlpha=Se,wa(e,O,W,c,B,n.images,J,!0),e.restore()}if(r>=Q&&r<se){let J=(r-Q)/K,Se=Math.min(F.slides-1,Math.floor(J)),$=J-Math.floor(J);Se%2===1&&($=1-$),$=Math.max(0,Math.min(1,$));let ee=Yd(N,$),[ve,fe]=rt(ee.x,ee.y);Jd(e,ve,fe,c,B,n.images,n.config.allowSliderBallTint)}}else if(F.type==="spinner"){let N=i.get(I),{cumAngle:O,absAngle:W}=N?ia(N,r):{cumAngle:0,absAngle:0},Q=F.endTime-F.time,se=aa(a.od,Q,W,a.isLazer);em(e,n.spinnerImages,r,F,O,se,se>=1,n,N?.bonusTimes??[])}e.restore()}}function Sa(e,t,n,r,o,i){let a=Te(i,"hitcircle"),s=Te(i,"hitcircleoverlay");if(a){if(Ne(a.bmp))return;let l=We(a,r);if(e.drawImage(qt(a.bmp,o),t-l/2,n-l/2,l,l),s&&!Ne(s.bmp)){let u=We(s,r);e.drawImage(s.bmp,t-u/2,n-u/2,u,u)}return}e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.strokeStyle=o,e.lineWidth=3,e.stroke(),e.beginPath(),e.arc(t,n,r-2,0,Math.PI*2),e.fillStyle=jn(o,.25),e.fill(),e.beginPath(),e.arc(t,n,r*.15,0,Math.PI*2),e.fillStyle=jn("#ffffff",.6),e.fill()}function va(e,t,n,r,o,i){let a=Te(i,"sliderstartcircle"),s=Te(i,"sliderstartcircleoverlay"),l=Te(i,"hitcircle"),u=Te(i,"hitcircleoverlay"),c=a??l,d=a?s:u;if(c){if(Ne(c.bmp))return;let m=We(c,r);if(e.drawImage(qt(c.bmp,o),t-m/2,n-m/2,m,m),d&&!Ne(d.bmp)){let f=We(d,r);e.drawImage(d.bmp,t-f/2,n-f/2,f,f)}return}e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.strokeStyle=o,e.lineWidth=3,e.stroke(),e.beginPath(),e.arc(t,n,r-2,0,Math.PI*2),e.fillStyle=jn(o,.25),e.fill(),e.beginPath(),e.arc(t,n,r*.15,0,Math.PI*2),e.fillStyle=jn("#ffffff",.6),e.fill()}function wa(e,t,n,r,o,i,a,s=!1){qi(e,t,n,r,o,a)}function Fn(e,t,n,r,o,i){let a=Te(i,"approachcircle");if(a){let s=We(a,r);e.drawImage(qt(a.bmp,o),t-s/2,n-s/2,s,s);return}e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.strokeStyle=o,e.lineWidth=2,e.stroke()}var xa=new WeakMap;function zd(e,t,n,r,o){return Zi(e,t,n,r,o,rt)}function Gd(e,t,n,r,o,i,a,s){let l=xa.get(t);if(l===void 0||l.radius!==r||l.borderColor!==o||l.trackColor!==i||l.isHR!==a||l.quality!==s){let u=zd(n,r,o,i,s);if(u===null)return;l={...u,radius:r,borderColor:o,trackColor:i,isHR:a,quality:s},xa.set(t,l)}e.drawImage(l.bmp,l.ox,l.oy,l.w,l.h)}function Yd(e,t){if(e.length===0)return{x:0,y:0};if(t<=0||e.length===1)return{...e[0]};if(t>=1)return{...e[e.length-1]};let n=t*(e.length-1),r=Math.floor(n),o=Math.min(r+1,e.length-1),i=n-r;return{x:e[r].x+(e[o].x-e[r].x)*i,y:e[r].y+(e[o].y-e[r].y)*i}}function Kd(e,t,n,r){if(e<=1)return!1;let o=r>=0?2*Math.floor((e-2)/2)+1:1;return t<n+r*o}function qd(e,t,n,r){if(e<=2)return!1;let o=r>=0?2*Math.floor((e-1)/2):2;return t<n+r*o}function Jd(e,t,n,r,o,i,a){let s=Te(i,"sliderfollowcircle");if(s){if(s.bmp.width>1){let u=We(s,r);e.drawImage(s.bmp,t-u/2,n-u/2,u,u)}}else e.beginPath(),e.arc(t,n,r*2.2,0,Math.PI*2),e.strokeStyle="rgba(255,255,255,0.35)",e.lineWidth=2,e.stroke();let l=Te(i,"sliderb")??Te(i,"sliderb0");if(l){let u=We(l,r),c=a?qt(l.bmp,o):l.bmp;e.drawImage(c,t-u/2,n-u/2,u,u)}else e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.fillStyle="rgba(255,255,255,0.9)",e.fill(),e.strokeStyle=o,e.lineWidth=3,e.stroke()}var Ma=new WeakMap;function Zd(e){let t=Ma.get(e);return t===void 0&&(t=e.filter(n=>!n.inherited),Ma.set(e,t)),t}function Qd(e,t){let n=Zd(e);if(n.length===0||n[0].time>t)return{beatLength:500,tpTime:0};let r=0,o=n.length-1;for(;r<o;){let i=r+o+1>>>1;n[i].time<=t?r=i:o=i-1}return{beatLength:n[r].beatLength,tpTime:n[r].time}}function Ta(e,t,n,r,o,i,a,s,l,u){let d=1+.3*(1-((s-l)%u+u)%u/u);e.save(),e.translate(t,n),e.rotate(r),e.scale(d,d);let m=Te(a,"reversearrow");if(m){let f=We(m,o)/2;e.drawImage(m.bmp,-f,-f,f*2,f*2)}else{let f=o*.68;e.beginPath(),e.moveTo(f,0),e.lineTo(-f*.45,f*.6),e.lineTo(-f*.15,0),e.lineTo(-f*.45,-f*.6),e.closePath(),e.fillStyle="#ffffff",e.fill(),e.strokeStyle=i,e.lineWidth=2,e.stroke()}e.restore()}function Nn(e,t,n,r,o,i,a){if(o<=0)return;let s=String(o).split(""),{images:l}=i,u=i.config.hitCirclePrefix,c=i.config.hitCircleOverlap,d=s[0],m=s.map(f=>l.get(`${u}-${f}@2x.png`)??l.get(`${u}-${f}.png`));if(m.every(f=>f!==void 0)){let f=Te(l,"hitcircle"),h;if(f!==void 0&&!Ne(f.bmp)){let T=f.bmp.width/f.scale;h=We(f,r)/T}else h=2*r/128;let p=l.get(`${u}-${d}.png`),b=l.get(`${u}-${d}@2x.png`),S=p?.height??(b!==void 0?b.height/2:m[0].height),g=.8*h,v=a?r*2/Ea(m[0]):S*g,x=m.map(T=>T.width*(v/T.height)),k=a?c*(v/S):c*g,M=x.map(T=>T-k),y=M.slice(0,-1).reduce((T,C)=>T+C,0)+x[x.length-1],w=t-y/2;for(let T=0;T<m.length;T++)e.drawImage(m[T],w,n-v/2,x[T],v),w+=M[T]}else{let f=Math.max(8,Math.round(r*.9));e.font=`bold ${f}px ${Ca}`,e.textAlign="center",e.textBaseline="middle",e.lineWidth=Math.max(2,f*.15),e.strokeStyle="rgba(0,0,0,0.75)",e.strokeText(String(o),t,n),e.fillStyle="#ffffff",e.fillText(String(o),t,n)}}function em(e,t,n,r,o,i,a,s,l){let[u,c]=rt(Rd,Pd),d=.624*(nt/480);function m(y){let w=t.get(`${y}@2x.png`);if(w&&w.width>1)return{bmp:w,scale:d/2};let T=t.get(`${y}.png`);if(T&&T.width>1)return{bmp:T,scale:d}}function f(y,w,T,C=0,E=1){let R=y.bmp.width*y.scale*E,D=y.bmp.height*y.scale*E;C!==0?(e.save(),e.translate(w,T),e.rotate(C),e.drawImage(y.bmp,-R/2,-D/2,R,D),e.restore()):e.drawImage(y.bmp,w-R/2,T-D/2,R,D)}let h=.8+Math.min(1,i)*.2,p=m("spinner-background");p&&f(p,Wn/2,nt*(396.9/480));let b=m("spinner-glow");b&&(e.save(),e.globalCompositeOperation="lighter",f(b,u,c,0,h),e.restore());let S=m("spinner-bottom");S&&f(S,u,c,o/3,h);let g=m("spinner-top");g&&f(g,u,c,o*.5,h);let v=m("spinner-middle2");v&&f(v,u,c,o,h);let x=m("spinner-middle");if(x){let y=Math.min(1,Math.max(0,(n-r.time)/Math.max(1,r.endTime-r.time))),w=Math.round(y*31);if(w>0){let T=Math.round(255*(1-w/31)),C=qt(x.bmp,`rgb(255, ${T}, ${T})`),E=x.bmp.width*x.scale*h,R=x.bmp.height*x.scale*h;e.drawImage(C,u-E/2,c-R/2,E,R)}else f(x,u,c,0,h)}let k=m("spinner-circle");k&&f(k,u,c,o,h);let M=m("spinner-metre");if(M&&i>0){let y=M.bmp.width*M.scale,w=M.bmp.height*M.scale,T=u-y/2,C=c-w/2,E=w*Math.min(1,i);e.save(),e.beginPath(),e.rect(T,C+w-E,y,E),e.clip(),e.drawImage(M.bmp,T,C,y,w),e.restore()}if(n<r.endTime){let y=Math.max(1,r.endTime-r.time),w=Math.max(0,n-r.time),C=1.9-1.8*Math.min(1,w/y),E=m("spinner-approachcircle");E&&f(E,u,c,0,C)}if(a){let y=m("spinner-clear");y&&f(y,Wn/2,nt*(230/768))}else if(n>=r.time){let y=m("spinner-spin");y&&f(y,Wn/2,nt*(582/768))}if(l.length>0){let y=0;for(let E=0;E<l.length&&l[E]<=n;E++)y++;let w=y>0?n-l[y-1]:1/0,T=800,C=1e3;if(y>0&&w<T){let E=1-w/T,R=1+.5*Math.pow(1-Math.min(1,w/C),5),D=c+80*(nt/480);tm(e,s,u,D,y*1e3,E,R)}}}function tm(e,t,n,r,o,i,a){let s=t.config.scorePrefix||"score",l=String(o),u=nt*.05*a,c=p=>t.images.get(`${s}-${p}@2x.png`)??t.images.get(`${s}-${p}.png`),d=[],m=0;for(let p of l){let b=c(p),S=b?b.width/b.height*u:u*.55;d.push(S),m+=S}e.save(),e.globalAlpha=Math.max(0,Math.min(1,i));let f=n-m/2,h=r-u/2;for(let p=0;p<l.length;p++){let b=l.charAt(p),S=c(b),g=d[p];S?e.drawImage(S,f,h,g,u):(e.font=`bold ${Math.round(u*.9)}px ${Ca}`,e.textAlign="left",e.textBaseline="top",e.fillStyle="#ffffff",e.fillText(b,f,h)),f+=g}e.restore()}function jn(e,t){let n=e.replace("#",""),r=parseInt(n.substring(0,2),16),o=parseInt(n.substring(2,4),16),i=parseInt(n.substring(4,6),16);return`rgba(${r},${o},${i},${t})`}var _a=512,La=384,nm=1280,rm=720,Jt=Math.min(800/_a,600/La)*.9,om=(nm-_a*Jt)/2,im=(rm-La*Jt)/2;function am(e,t){return[om+e*Jt,im+t*Jt]}var Ra=800,Un=32,sm=5e3,lm=400,cm=240,Pa=new WeakMap;function um(e){let t=Pa.get(e);if(t!==void 0)return t;let n=i=>{let a=e.get(`${i}@2x.png`);if(a&&a.width>1)return{bitmap:a,is2x:!0};let s=e.get(`${i}.png`);return s&&s.width>1?{bitmap:s,is2x:!1}:null},r=[];for(let i=0;e.has(`followpoint-${i}.png`)||e.has(`followpoint-${i}@2x.png`);i++){let s=n(`followpoint-${i}`);s!==null&&r.push(s)}let o=null;if(r.length>0)o={frames:r,frameDurMs:1e3/r.length};else{let i=n("followpoint");i!==null&&(o={frames:[i],frameDurMs:1e3})}return Pa.set(e,o),o}function dm(e,t,n){if(e.type==="spinner")return null;let r=-e.stackHeight*t/10;return{x:e.x+r,y:n(e.y)+r}}function mm(e,t,n){if(e.type==="spinner")return null;if(e.type==="circle"){let a=-e.stackHeight*t/10;return{x:e.x+a,y:n(e.y)+a}}let r=ue(e),o=e.slides%2===1?r[r.length-1]:r[0],i=-e.stackHeight*t/10;return{x:o.x+i,y:n(o.y)+i}}function fm(e,t){return e.type==="slider"?e.time+le(t,e)*e.slides:e.type==="spinner"?e.endTime:e.time}function Oa(e,t,n,r,o){let i=um(n.images);if(i===null)return;let a=o.circleRadiusPx,s=o.preemptMs,l=o.isHR?p=>384-p:p=>p,u=Math.min(1,s/450),c=lm*u,d=cm*u,m=t.hitObjects,f=1,h=m.length-1;if(m.length>1){let p=r-d,b=r+s,S=1,g=m.length;for(;S<g;){let v=S+g>>>1;m[v].time<p?S=v+1:g=v}if(f=S,f>=m.length||m[f].time>b)h=f-1;else{for(S=f,g=m.length-1;S<g;){let v=S+g+1>>>1;m[v].time<=b?S=v:g=v-1}h=S}}for(let p=f;p<=h;p++){let b=m[p-1],S=m[p];if(b.type==="spinner"||S.type==="spinner"||S.newCombo)continue;let g=fm(b,t),v=S.time,x=v-g;if(x<=0)continue;let k=v-s;if(r<Math.max(g-Ra,k)||r>v+d)continue;let M=mm(b,a,l),y=dm(S,a,l);if(M===null||y===null)continue;let w=y.x-M.x,T=y.y-M.y,C=Math.hypot(w,T);if(C<Un*1.5)continue;let E=Math.atan2(T,w),R=a/64*Jt,D=Math.max(Un*1.5,C-sm),_=C-Un;for(let P=D;P<_;P+=Un){let U=P/C,H=Math.max(g+U*x-Ra,k),I=g+U*x;if(r<H||r>I+d)continue;let B;if(r<H+c?B=(r-H)/c:r<=I?B=1:B=1-(r-I)/d,B<=0)continue;let j=M.x+w*U,K=M.y+T*U,[V,G]=am(j,K),F=i.frames.length===1?0:Math.floor(r/i.frameDurMs)%i.frames.length,L=i.frames[F],N=L.is2x?2:1,O=L.bitmap.width/N*R,W=L.bitmap.height/N*R;e.save(),e.globalAlpha=B,e.translate(V,G),e.rotate(E),e.drawImage(L.bitmap,-O/2,-W/2,O,W),e.restore()}}}var Da=new WeakMap;function pm(e){let t=Da.get(e);if(t===void 0){t=new Array(e.length);let n=0;for(let r=0;r<e.length;r++)n+=e[r].timeDelta,t[r]=n;Da.set(e,t)}return t}var to=10,$n=6,Zt=Math.min(800/512,600/384)*.9,hm=(1280-512*Zt)/2,bm=(720-384*Zt)/2,Ha=Zt/1.6;function Vn(e,t){return[hm+e*Zt,bm+t*Zt]}function no(e,t){let n=e.get(`${t}@2x.png`);if(n)return n.width<=1&&n.height<=1?void 0:{bmp:n,scale:2};let r=e.get(`${t}.png`);if(r)return r.width<=1&&r.height<=1?void 0:{bmp:r,scale:1}}function ro(e,t,n,r){let o=t.bmp.width/t.scale*Ha,i=t.bmp.height/t.scale*Ha;e.drawImage(t.bmp,n-o/2,r-i/2,o,i)}function Ba(e,t){if(e.length===0||t<e[0])return-1;if(t>=e[e.length-1])return e.length-1;let n=0,r=e.length-2;for(;n<r;){let o=n+r+1>>1;e[o]<=t?n=o:r=o-1}return n}function gm(e,t,n){let r=Ba(t,n);if(r<0){let m=e[0];return Vn(m.x,m.y)}if(r>=e.length-1){let m=e[e.length-1];return Vn(m.x,m.y)}let o=t[r],a=t[r+1]-o,s=a<1e-6?0:(n-o)/a,l=e[r],u=e[r+1],c=l.x+(u.x-l.x)*s,d=l.y+(u.y-l.y)*s;return Vn(c,d)}function Qt(e,t,n,r){let{frames:o}=t;if(o.length===0)return;let i=pm(o),a=Ba(i,n);if(a<0)return;let s=Math.max(0,a-to+1),l=r?no(r.images,"cursortrail"):void 0;if(l||!r)for(let f=a;f>=s;f--){let h=a-f,p=1-h/to,[b,S]=Vn(o[f].x,o[f].y);e.save(),l?(e.globalAlpha=p*.7,ro(e,l,b,S)):(e.globalAlpha=p*.55,e.beginPath(),e.arc(b,S,$n*(1-h/(to*1.5)),0,Math.PI*2),e.fillStyle="#e879a0",e.fill()),e.restore()}let[u,c]=gm(o,i,n),d=r?no(r.images,"cursor"):void 0,m=r?no(r.images,"cursormiddle"):void 0;if(d||m){d&&ro(e,d,u,c),m&&ro(e,m,u,c);return}e.save(),e.beginPath(),e.arc(u,c,$n+4,0,Math.PI*2),e.strokeStyle="rgba(232, 121, 160, 0.4)",e.lineWidth=3,e.stroke(),e.restore(),e.save(),e.beginPath(),e.arc(u,c,$n,0,Math.PI*2),e.fillStyle="#e879a0",e.fill(),e.beginPath(),e.arc(u,c,$n*.4,0,Math.PI*2),e.fillStyle="#ffffff",e.fill(),e.restore()}function Fa(e,t){let n=1;for(;n<e.length;)n*=2;let r=new Float64Array(n*2).fill(1/0),o=new Float64Array(n*2).fill(-1/0);e.forEach((i,a)=>{let[s,l]=t(i);r[n+a]=Number.isNaN(s)||Number.isNaN(l)?-1/0:Math.min(s,l),o[n+a]=Number.isNaN(s)||Number.isNaN(l)?1/0:Math.max(s,l)});for(let i=n-1;i>0;i--)r[i]=Math.min(r[i*2],r[i*2+1]),o[i]=Math.max(o[i*2],o[i*2+1]);return(i,a)=>{let s=[],l=(u,c,d)=>{if(c>=e.length||o[u]<i||r[u]>a)return;if(d-c===1){s.push(e[c]);return}let m=Math.floor((c+d)/2);l(u*2,c,m),l(u*2+1,m,d)};return l(1,0,n),s}}function Xn(e,t){let n=e[t==="mania"?"maniaTrackOpacity":"taikoTrackOpacity"];return typeof n=="number"&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):1}var Na=new WeakMap;function $a(e,t){if(!t.maniaIgnoreSV)return e;let n=Na.get(e);return n||(n={...e,scroll:{times:[0],multipliers:[1],cumRaw:[0]}},Na.set(e,n)),n}var Wa=new WeakMap;function Va(e){let t=Wa.get(e);if(t!==void 0)return t;t=500;for(let n of e)n.kind!=="hit"&&(t=Math.max(t,n.endTime-n.time));return t+=500,Wa.set(e,t),t}var ja=new WeakMap;function Xa(e,t,n){let r=ja.get(e);return r||(r=Fa(e,o=>o.kind==="note"?[o.time,o.time]:[o.startTime,o.endTime]),ja.set(e,r)),r(t,n)}var Ua=new WeakMap;function za(e,t,n,r){let o=Ua.get(e);o||(o={},Ua.set(e,o));let i=n?"taiko":"std",a=o[i];a||(a=e.flatMap((c,d)=>(n?c.comboIgnore===!0:c.isSliderSub===!0||c.judgement===300)?[]:[{result:c,index:d,displayTime:c.displayTime??c.time}]),a.sort((c,d)=>c.displayTime-d.displayTime||c.index-d.index),o[i]=a);let s=0,l=a.length;for(;s<l;){let c=s+l>>>1;a[c].displayTime<t-r?s=c+1:l=c}let u=[];for(let c=s;c<a.length&&a[c].displayTime<=t;c++)u.push(a[c]);return u.sort((c,d)=>c.index-d.index),u.map(c=>c.result)}var ym='system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif',Sm=1280,vm=720,en=Math.min(800/512,600/384)*.9,wm=(Sm-512*en)/2,xm=(vm-384*en)/2;function Mm(e,t){return[wm+e*en,xm+t*en]}var Re=120,io=500,Qa=600,zn=io+Qa,Ga=-5,Tm=40,Cm=.3,es=.15,St=120,ao=500,ts=600,Gn=ao+ts,km=1e3,Ya=100,Ka=1.6,qa=1,Ja=-5,Im=75,Em=8.6*Math.PI/180;function so(e){return e<=0?0:e>=1?1:e}function Am(e){let t=so(e);return t*t}function Rm(e){return e<St?e/St:e<ao?1:1-(e-ao)/ts}function Pm(e){return e<96?.6+(1.1-.6)*(e/96):e<120?1.1:e<144?1.1+(.9-1.1)*((e-120)/24):e<168?.95+(1-.95)*((e-144)/24):1}var ns={300:["hit300","hit300-0"],100:["hit100","hit100-0"],50:["hit50","hit50-0"],0:["hit0","hit0-0"]},rs={300:["taiko-hit300"],100:["taiko-hit100"],0:["taiko-hit0"]},os={300:["taiko-hit300k","taiko-hit300"],100:["taiko-hit100k","taiko-hit100"],0:["taiko-hit0"]},_m={300:["hit300","hit300-0"],100:["hit100","hit100-0"],0:["hit0","hit0-0"]};function oo(e,t){return e.get(`${t}@2x.png`)??e.get(`${t}.png`)}function lo(e,t){let n=e.get(`${t}@2x.png`);if(n!==void 0&&n.width>1)return{bitmap:n,pixelScale:.5};let r=e.get(`${t}.png`);if(r!==void 0&&r.width>1)return{bitmap:r,pixelScale:1}}function is(e,t){let n=e.get(`${t}@2x.png`);if(n!==void 0&&n.width===1)return!0;let r=e.get(`${t}.png`);return r!==void 0&&r.width===1}function Lm(e,t){let n=[];for(let o=0;;o++){let i=lo(e,`${t}-${o}`);if(i===void 0){if(is(e,`${t}-${o}`))return[];break}n.push(i)}if(n.length>0)return n;let r=lo(e,t);return r!==void 0?[r]:[]}function Om(e,t){let n=ns[t];if(n)for(let r of n){let o=lo(e,r);if(o!==void 0)return o}}function Dm(e,t,n,r){if(n){let i=(r?os:rs)[t]??[],a=!1;for(let s of i){let l=oo(e,s);if(l!==void 0){if(l.width>1)return l;a=!0}}if(a)return;for(let s of _m[t]??[]){let l=oo(e,s);if(l!==void 0&&l.width>1)return l}return}let o=ns[t];if(o)for(let i of o){let a=oo(e,i);if(a!==void 0&&a.width>1)return a}}function Hm(e,t,n){let r=(n?os:rs)[t]??[],o=!1;for(let i of r){let a=Lm(e,i);if(a.length>0)return a;is(e,i)&&(o=!0)}return o?null:[]}var Bm={300:"300",100:"100",50:"50",0:"\u2717"},Fm={300:"#ffff44",100:"#44ccff",50:"#88ff88",0:"#ff5555"},Nm={300:22,100:20,50:18,0:26},Yn=128,Wm=128;function jm(e){let t=Re*.8,n=Re,r=Re*1.2,o=Re*1.4;return e<t?.6+(1.1-.6)*(e/t):e<n?1.1:e<r?1.1+(.9-1.1)*((e-n)/(r-n)):e<o?.9+(1-.9)*((e-r)/(o-r)):1}function Za(e){let t=Math.sin(e*.1234567)*43758.5453;return(t-Math.floor(t))*Cm-es}function as(e,t,n,r,o="std",i){let a=o==="taiko";for(let s of za(t,n,a,a?Gn:zn)){if(a){if(s.comboIgnore===!0)continue}else if(s.isSliderSub===!0||s.judgement===300)continue;let l=s.judgement,u=s.displayTime??s.time,c=n-u,d=a?Gn:zn;if(c<0||c>d)continue;let m=l===0,[f,h]=a?[s.x,s.y]:Mm(s.x,s.y),p,b,S=f,g=h,v=0,x;a&&r&&(x=Hm(r.images,l,s.strong===!0));let k=a&&x!==void 0&&x!==null&&x.length>1;if(a)if(p=Rm(c),k)b=1;else if(m){b=c>=Ya?qa:Ka+(qa-Ka)*Am(c/Ya);let y=so(c/Gn);g+=Ja+(Im-Ja)*(y*y);let w=Za(s.time)*(Em/es);if(c<St)v=w*(c/St);else{let T=so((c-St)/(Gn-St));v=w+w*(T*T)}}else b=Pm(c);else if(c<Re?p=c/Re:c<io?p=1:p=1-(c-io)/Qa,b=jm(c),m){g=h+Ga+(Tm-Ga)*(c/zn);let y=Za(s.time);c<Re?v=y*(c/Re):v=y+y*((c-Re)/(zn-Re))}e.save(),e.globalAlpha=Math.max(0,Math.min(1,p)),e.translate(S,g),v!==0&&e.rotate(v),e.scale(b,b);let M=a&&s.strong===!0;if(a&&x!==void 0&&x!==null&&x.length>0){let y=0;if(x.length>1){let E=km/x.length;y=Math.min(x.length-1,Math.max(0,Math.floor(c/E)))}let w=x[y],T=w.bitmap.width*w.pixelScale,C=w.bitmap.height*w.pixelScale;e.drawImage(w.bitmap,-T/2,-C/2,T,C)}else if(!(a&&x===null)){let y;if(a){let w=r?Dm(r.images,l,!0,M):void 0;if(w!==void 0){let T=w.width/w.height;y={bitmap:w,drawW:T>=1?Yn:Yn*T,drawH:T>=1?Yn/T:Yn}}}else{let w=r?Om(r.images,l):void 0;if(w!==void 0&&i!==void 0){let T=2*i*en/Wm;y={bitmap:w.bitmap,drawW:w.bitmap.width*w.pixelScale*T,drawH:w.bitmap.height*w.pixelScale*T}}}if(y!==void 0)e.drawImage(y.bitmap,-y.drawW/2,-y.drawH/2,y.drawW,y.drawH);else{let w=Bm[l]??"?",T=Fm[l]??"#ffffff",C=Nm[l]??20;e.font=`bold ${C}px ${ym}`,e.textAlign="center",e.textBaseline="middle",e.strokeStyle="rgba(0,0,0,0.7)",e.lineWidth=3,e.strokeText(w,0,0),e.fillStyle=T,e.fillText(w,0,0)}}e.restore()}}var Um='system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';function Xe(e){let t=[...e].sort((o,i)=>o.time-i.time),n=[],r=0;for(let o of t)o.comboIgnore||(o.comboBreak&&(r=0),o.judgement>0&&!o.comboBreak&&r++,n.push({time:o.time,combo:r}));return n}function $m(e,t){if(e.length===0||t<e[0].time)return-1;if(t>=e[e.length-1].time)return e.length-1;let n=0,r=e.length-2;for(;n<r;){let o=n+r+1>>1;e[o].time<=t?n=o:r=o-1}return n}var Vm={0:"0",1:"1",2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",".":"dot","%":"percent",x:"x"};function cs(e,t,n,r){let o=Vm[n];if(o===void 0)return;let i=e.get(`${t}-${o}@2x.png`),a=e.get(`${t}-${o}.png`);return i===void 0?a:a===void 0||r===void 0||r>a.height?i:a}var ss=new WeakMap;function co(e,t,n){if(e===void 0)return .65;let r=ss.get(e);r===void 0&&(r=new Map,ss.set(e,r));let o=r.get(t);o===void 0&&(o=new Map,r.set(t,o));let i=o.get(n);if(i===void 0){let a=cs(e.images,t,n);i=a!==void 0?a.width/a.height:.65,o.set(n,i)}return i}function Xm(e,t,n,r,o,i,a){let s=0;for(let d=0;d<t.length;d++)s+=co(a,i,t.charAt(d))*o;let l=(typeof e.getTransform=="function"?e.getTransform().a:1)||1,u=o*l,c=n-s;for(let d=0;d<t.length;d++){let m=t.charAt(d),f=co(a,i,m)*o,h=a?cs(a.images,i,m,u):void 0;h?e.drawImage(h,c,r,f,o):(e.save(),e.font=`bold ${Math.round(o*.85)}px ${Um}`,e.textAlign="left",e.textBaseline="top",e.strokeStyle="rgba(0,0,0,0.75)",e.lineWidth=2,e.strokeText(m,c,r),e.fillStyle="#ffffff",e.fillText(m,c,r),e.restore()),c+=f}}var ls=28;function zm(e,t,n,r,o,i,a){let s=$m(t,n),l=s>=0?t[s].combo:0;if(l===0)return;let u=String(l)+r,c=s>=0?n-t[s].time:250,d=i?.config.comboPrefix??"score",m=0;for(let g=0;g<u.length;g++)m+=co(i,d,u.charAt(g))*o;let f=c<250?1+.4*(1-c/250):1,{rightX:h,topY:p,cx:b,cy:S}=a(m);e.save(),e.translate(b,S),e.scale(f,f),e.translate(-b,-S),Xm(e,u,h,p,o,d,i),e.restore()}function us(e,t,n,r,o,i){zm(e,t,n,"",ls,i,a=>({rightX:r+a/2,topY:o-ls/2,cx:r,cy:o}))}var nn=1280,rn=720,fs=512,ps=384,on=Math.min(800/fs,600/ps)*.9,Gm=(nn-fs*on)/2,Ym=(rn-ps*on)/2,at=168,ot=at*8,Km=at*2.5,ze=800,qm=ze*2,ds=120,Jm=.8,ms=50,Zm=1,tn=16,Qm=100,ef=200,tf=.8125,nf=.625;function rf(e){return e>ef?at*nf:e>Qm?at*tf:at}function mo(e,t,n){if(e.length===0)return n;let r=0,o=e.length-1,i=-1;for(;r<=o;){let u=r+o>>1;e[u].tStart<=t?(i=u,r=u+1):o=u-1}if(i<0)return e[0].vStart;let a=e[i];if(t>=a.tEnd)return a.vEnd;let s=(t-a.tStart)/(a.tEnd-a.tStart),l=a.ease==="outQuad"?1-(1-s)*(1-s):s;return a.vStart+(a.vEnd-a.vStart)*l}function it(e,t,n,r,o,i){let a=mo(e,n,t);if(e.length>0){let s=e[e.length-1];s.tEnd>n&&(s.tEnd=n,s.vEnd=a)}e.push({tStart:n,tEnd:n+o,vStart:a,vEnd:r,ease:i})}function of(e){let t=new Array(e.length),n=0;for(let r=0;r<e.length;r++)n+=e[r].timeDelta,t[r]=n;return t}function af(e,t,n,r){let o=r;for(;o+1<e.length&&t[o+1]<=n;)o++;if(o>=e.length-1){let d=e[e.length-1];return{x:d.x,y:d.y,idx:o}}let i=t[o],s=t[o+1]-i,l=s<1e-6?0:(n-i)/s,u=e[o],c=e[o+1];return{x:u.x+(c.x-u.x)*l,y:u.y+(c.y-u.y)*l,idx:o}}function sf(e){let t=e.frames;if(t.length===0)return{startTimeMs:0,stepMs:tn,xs:new Float32Array(0),ys:new Float32Array(0)};let n=of(t),r=n[0],o=n[n.length-1],i=Math.max(0,o-r),a=Math.ceil(i/tn)+1,s=new Float32Array(a),l=new Float32Array(a),u=t[0].x,c=t[0].y;s[0]=u,l[0]=c;let d=Math.min(tn,ds)/ds,m=1-(1-d)*(1-d),f=0;for(let h=1;h<a;h++){let p=r+h*tn,b=af(t,n,p,f);f=b.idx,u=u+(b.x-u)*m,c=c+(b.y-c)*m,s[h]=u,l[h]=c}return{startTimeMs:r,stepMs:tn,xs:s,ys:l}}function lf(e,t){let n=e.xs.length;if(n===0)return{x:256,y:192};let r=(t-e.startTimeMs)/e.stepMs;if(r<=0)return{x:e.xs[0],y:e.ys[0]};if(r>=n-1)return{x:e.xs[n-1],y:e.ys[n-1]};let o=Math.floor(r),i=r-o;return{x:e.xs[o]+(e.xs[o+1]-e.xs[o])*i,y:e.ys[o]+(e.ys[o+1]-e.ys[o])*i}}var uo=null;function cf(){if(uo!==null)return uo;let e=512,t=new OffscreenCanvas(e,e),n=t.getContext("2d"),r=e/2,o=n.createRadialGradient(r,r,0,r,r,r),i=40;for(let a=0;a<=i;a++){let s=a/i,l=1-Math.pow(s,5);o.addColorStop(s,`rgba(0, 0, 0, ${l})`)}return n.fillStyle=o,n.fillRect(0,0,e,e),uo=t,t}function uf(e,t,n){let r=[],o=e.hitObjects;if(o.length===0)return r;let i=o[0].time,a=o[o.length-1],l=("endTime"in a?a.endTime:a.time)+t.hitWindow50+5;it(r,ot,i-ze,at,ze,"outQuad");let u=[],c=Xe(n);for(let m of c)u.push({kind:"combo",t:m.time,combo:m.combo});for(let m of e.breaks)m.endTime-m.startTime>qm&&(u.push({kind:"breakStart",t:m.startTime}),u.push({kind:"breakEndPrep",t:m.endTime-ze}));u.sort((m,f)=>{if(m.t!==f.t)return m.t-f.t;let h=p=>p==="combo"?0:p==="breakStart"?1:2;return h(m.kind)-h(f.kind)});let d=at;for(let m of u)if(m.kind==="combo"){let f=rf(m.combo);f!==d&&(d=f,it(r,ot,m.t,f,ze,"outQuad"))}else m.kind==="breakStart"?it(r,ot,m.t,Km,ze,"outQuad"):it(r,ot,m.t,d,ze,"outQuad");return it(r,ot,l,ot,ze,"outQuad"),r}function df(e){let t=[];for(let n of e)it(t,0,n.start,Jm,ms,"linear"),it(t,0,n.end,0,ms,"linear");return t}var an=class{constructor(t,n,r,o,i,a=1){A(this,"timelines");A(this,"falloff");A(this,"buffer");A(this,"bctx");this.timelines={sizeSegments:uf(t,r,o),dimSegments:df(i),smoothed:sf(n)},this.falloff=cf(),this.buffer=new OffscreenCanvas(nn*a,rn*a);let s=this.buffer.getContext("2d");if(s===null)throw new Error("Flashlight: failed to get 2D context on buffer canvas");s.scale(a,a),this.bctx=s}draw(t,n){let r=mo(this.timelines.sizeSegments,n,ot),o=mo(this.timelines.dimSegments,n,0),i=lf(this.timelines.smoothed,n),a=Gm+i.x*on,s=Ym+i.y*on,l=r*on*2,u=this.bctx;u.globalCompositeOperation="source-over",u.globalAlpha=1,u.clearRect(0,0,nn,rn),u.fillStyle=`rgba(0, 0, 0, ${Zm})`,u.fillRect(0,0,nn,rn),u.globalCompositeOperation="destination-out",u.globalAlpha=1-o,u.drawImage(this.falloff,a-l/2,s-l/2,l,l),u.globalCompositeOperation="source-over",u.globalAlpha=1,t.save(),t.globalCompositeOperation="source-over",t.globalAlpha=1,t.drawImage(this.buffer,0,0,nn,rn),t.restore()}};var hs=new WeakMap;function mf(e,t){if(t===e.modDiff.isHD)return e.modDiff;let n=hs.get(e);return n===void 0&&(n={...e.modDiff,isHD:!e.modDiff.isHD},hs.set(e,n)),n}var bs=new WeakMap;function ff(e){if(e.flashlight!==null)return e.flashlight;let t=bs.get(e);return t===void 0&&(t=new an(e.beatmap,e.replay,e.modDiff,e.hitResults,e.trackingIntervals,e.qualityTotal),bs.set(e,t)),t}var gs={build(e,t,n,r,o){let{results:i,spinnerAngles:a,trackingIntervals:s}=sa(e,t,n),l=Xe(i),u=n.isFL?new an(e,t,n,i,s,o):null;return{beatmap:e,replay:t,modDiff:n,skin:r,hitResults:i,spinnerAngles:a,trackingIntervals:s,flashlight:u,comboFrames:l,qualityTotal:o}},draw(e,t,n,r){let o=mf(t,r.modHidden);r.showFollowpoints&&Oa(e,t.beatmap,t.skin,n,o),Aa(e,t.beatmap,t.skin,n,t.hitResults,t.spinnerAngles,o,t.qualityTotal),as(e,t.hitResults,n,t.skin,"std",o.circleRadiusPx),r.modFlashlight&&ff(t).draw(e,n),Qt(e,t.replay,n,t.skin)},hitResults:e=>e.hitResults,comboFrames:e=>e.comboFrames};var pf=[{bit:1,action:"LeftCentre"},{bit:2,action:"LeftRim"},{bit:4,action:"RightCentre"},{bit:8,action:"RightRim"}];function ys(e){let t=[],n=0,r=0;for(let o of e.frames){n+=o.timeDelta;let i=o.keys&15,a=i&~r;if(a!==0)for(let{bit:s,action:l}of pf)a&s&&t.push({time:n,action:l});r=i}return t}var Ss=new Map;function hf(e){let t=Ss.get(e);if(t!==void 0)return t;let n=new OffscreenCanvas(1024,1024),r=n.getContext("2d"),o=1024/2,i=r.createRadialGradient(o,o,0,o,o,o);i.addColorStop(0,"rgba(0,0,0,0)"),i.addColorStop(e,"rgba(0,0,0,0)");for(let a=1;a<8;a++){let s=a/8,l=s*s*(3-2*s),u=e+s*(1-e);i.addColorStop(Math.min(1,u),`rgba(0,0,0,${l.toFixed(4)})`)}return i.addColorStop(1,"rgba(0,0,0,1)"),r.fillStyle=i,r.fillRect(0,0,1024,1024),Ss.set(e,n),n}function Kn(e,t,n,r,o,i,a,s,l){let u=hf(o),c=t-r,d=n-r,m=r*2;e.save(),e.beginPath(),e.rect(i,a,s,l),e.clip(),e.globalCompositeOperation="source-over",e.globalAlpha=1,e.fillStyle="#000",e.fillRect(i,a,Math.max(0,c-i),l),e.fillRect(c+m,a,Math.max(0,i+s-(c+m)),l),e.fillRect(c,a,m,Math.max(0,d-a)),e.fillRect(c,d+m,m,Math.max(0,a+l-(d+m))),e.drawImage(u,c,d,m,m),e.restore()}var Ms=200,Ts=1,vs=1.4,po=800,bf=2.5,gf=100,yf=200,Sf=.8125,vf=.625,wf=po*2,ws=0,xf=1280,Mf=260,Tf=200,Cf=256,kf=360,If=1;function xs(e){return e>=yf?vf:e>=gf?Sf:1}function Cs(e,t,n){if(e.length===0)return n;let r=0,o=e.length-1,i=-1;for(;r<=o;){let l=r+o>>1;e[l].tStart<=t?(i=l,r=l+1):o=l-1}if(i<0)return e[0].vStart;let a=e[i];if(t>=a.tEnd)return a.vEnd;let s=(t-a.tStart)/(a.tEnd-a.tStart);return a.vStart+(a.vEnd-a.vStart)*s}function fo(e,t,n,r){let o=Cs(e,n,t);if(e.length>0){let i=e[e.length-1];i.tEnd>n&&(i.tEnd=n,i.vEnd=o)}e.push({tStart:n,tEnd:n+po,vStart:o,vEnd:r})}function Ef(e,t){let n=[],r=Ms*Ts,o=[],i=1;for(let s of t){let l=xs(s.combo);l!==i&&(o.push({kind:"combo",t:s.time,combo:s.combo}),i=l)}for(let s of e.breaks)s.endTime-s.startTime>wf&&(o.push({kind:"breakStart",t:s.startTime}),o.push({kind:"breakEndPrep",t:s.endTime-po}));o.sort((s,l)=>{if(s.t!==l.t)return s.t-l.t;let u=c=>c==="combo"?0:c==="breakStart"?1:2;return u(s.kind)-u(l.kind)});let a=r;for(let s of o)if(s.kind==="combo"){let l=r*xs(s.combo);l!==a&&(a=l,fo(n,r,s.t,l))}else s.kind==="breakStart"?fo(n,r,s.t,r*bf):fo(n,r,s.t,a);return n}var vt=class{constructor(t,n){A(this,"sizeSegments");A(this,"initialSize",Ms*Ts);this.sizeSegments=Ef(t,n)}draw(t,n){let r=Cs(this.sizeSegments,n,this.initialSize)*If;if(r<=0)return;let o=r*vs;Kn(t,Cf,kf,o,1/vs,ws,Mf,xf-ws,Tf)}};var Jn=1280,xo=720,Mo=200,Us=180,Af=-24,Rf=Mo,Pf=Us+Rf/2+Af,_f=.45,Lf=1/.65,Of=1.4,pe=1,ge=Mo*pe,de=(xo-ge)/2,ce=de+ge/2,Zn=Us*pe,_e=Pf*pe,ye=Zn,he=Jn,Qn=_f*Mo*pe/2,To=Qn*Lf,Tt=_e,Ct=ce,Df=60,Hf="rgb(235, 69, 44)",Bf="rgb(68, 141, 171)",wt={r:238,g:170,b:0},ho={r:204,g:102,b:0},$s=5,Ff=100;function Pe(e,t){return e.get(`${t}@2x.png`)??e.get(`${t}.png`)}var ks=new WeakMap;function qn(e,t){let n=ks.get(e);n===void 0&&(n=new Map,ks.set(e,n));let r=n.get(t);if(r!==void 0)return r;let{width:o,height:i}=e,a=new OffscreenCanvas(o,i),s=a.getContext("2d");return s.drawImage(e,0,0),s.globalCompositeOperation="multiply",s.fillStyle=t,s.fillRect(0,0,o,i),s.globalCompositeOperation="destination-in",s.drawImage(e,0,0),n.set(t,a),a}function yo(e,t,n,r,o){let i=t.width/t.height,a=i>=1?o:o*i,s=i>=1?o/i:o;e.drawImage(t,n-a/2,r-s/2,a,s)}function Vs(e,t,n){let r=e.has(`${t}@2x.png`)?.5:1;return Math.max(n.width,n.height)*r}function Xs(e,t,n,r,o,i,a){let s=a/i,l=t.width*n*s,u=t.height*n*s;e.drawImage(t,r-l/2,o-u/2,l,u)}function So(e,t){let n=500,r=1,o=4,i=!1;for(let a of e){if(a.time>t)break;a.inherited?r=et(a.beatLength):(n=a.beatLength,r=1,o=a.meter),i=a.kiai}return{baseBeatLength:n,svMultiplier:r,meter:o,kiai:i}}var Nf=1e3,Wf=5/4,jf=16/9,Uf=480,$f=160;function Vf(){return(Math.max(Wf,Math.min(jf,Jn/xo))*Uf-$f)/100*1e3/Of}var Xf=Vf();function Co(e,t,n,r=1){let{baseBeatLength:o,svMultiplier:i}=So(e.timingPoints,t),a=n?1:i;return o<=0?0:e.sliderMultiplier*r*a*Nf/o*er/Xf}function zs(e){return e.isHR?1.4*4/3:e.isEZ?.8:1}var er=he-_e,Is=1,Es=.375;function zf(e,t,n){if(n<=0)return 1;let r=er/n,o=e-t;if(o>=r*Is)return 1;let i=r*(Is-Es);return o<=i?0:(o-i)/(r*Es)}function Gs(e){let t=[];for(let i of e.timingPoints)i.inherited||t.push(i);if(t.length===0)return[];let n=0;for(let i of e.hitObjects){let a=i.type==="spinner"?i.endTime:i.time;a>n&&(n=a)}n+=5e3;let r=[],o=2e5;for(let i=0;i<t.length;i++){let a=t[i],s=i+1<t.length?t[i+1].time:n,l=Math.max(1,a.meter*a.beatLength);for(let u=a.time;u<s;u+=l)if(r.push(u),r.length>=o)return r}return r}function Gf(e){return e.kind==="hit"?e.time:e.endTime}function Yf(e,t,n,r){let o=e.length;if(o===0)return{firstIdx:0,lastIdx:-1};let i=t-r,a=t+n,s=0,l=o;for(;s<l;){let c=s+l>>>1;Gf(e[c])<i?s=c+1:l=c}let u=s;if(u>=o||e[u].time>a)return{firstIdx:u,lastIdx:u-1};for(s=u,l=o-1;s<l;){let c=s+l+1>>>1;e[c].time<=a?s=c:l=c-1}return{firstIdx:u,lastIdx:s}}function Kf(e,t,n){let r=e.length;if(r===0)return{firstIdx:0,lastIdx:-1};let o=0,i=r;for(;o<i;){let s=o+i>>>1;e[s]<t?o=s+1:i=s}let a=o;if(a>=r||e[a]>n)return{firstIdx:a,lastIdx:a-1};for(o=a,i=r-1;o<i;){let s=o+i+1>>>1;e[s]<=n?o=s:i=s-1}return{firstIdx:a,lastIdx:o}}function Mt(e,t,n){return _e+(e-t)*n}var As=1/200;function qf(e,t,n,r,o=1){e.save(),e.globalAlpha*=o;let i=t?Pe(t.images,"taiko-bar-right"):void 0,a=t?Pe(t.images,"taiko-bar-right-glow"):void 0,s=t?Pe(t.images,"taiko-bar-left"):void 0;if(i!==void 0){if(e.drawImage(i,0,de,he,ge),a!==void 0){let{transitionTime:l,kiaiOn:u}=Cp(n,r),c=0;if(isFinite(l)){let d=r-l;c=u?Math.min(1,d*As):Math.max(0,1-d*As)}c>0&&(e.save(),e.globalAlpha*=c,e.drawImage(a,0,de,he,ge),e.restore())}}else e.fillStyle="rgba(0, 0, 0, 0.55)",e.fillRect(ye,de,he-ye,ge);e.restore(),s!==void 0?e.drawImage(s,0,de,Zn,ge):(e.fillStyle="#1b1b1b",e.fillRect(0,de,Zn,ge)),i===void 0&&(e.save(),e.globalAlpha*=o,e.strokeStyle="rgba(255, 255, 255, 0.18)",e.lineWidth=1,e.beginPath(),e.moveTo(0,de),e.lineTo(Jn,de),e.moveTo(0,de+ge),e.lineTo(Jn,de+ge),e.stroke(),e.restore())}var Jf=.8,Zf=.83,Qf=.22,ep=.47;function tp(e,t){if(t===void 0)return;let n=ke(t.images,"taikobigcircle");if(n===void 0)return;let r=ke(t.images,"approachcircle");e.save(),r!==void 0&&(e.globalAlpha=ep,xt(e,r,_e,ce,Zf)),e.globalAlpha=Qf,xt(e,n,_e,ce,Jf),e.restore()}function np(e,t,n,r,o,i,a){let{firstIdx:s,lastIdx:l}=Kf(t,r-i,r+o);if(l<s)return;let u=a?Pe(a.images,"taiko-barline"):void 0;if(u!==void 0){let c=u.width/u.height,d=ge,m=d*c,f=de;for(let h=s;h<=l;h++){let p=_e+(t[h]-r)*n[h];p<ye||p>he||e.drawImage(u,p-m/2,f,m,d)}return}e.strokeStyle="rgba(255, 255, 255, 0.13)",e.lineWidth=1,e.beginPath();for(let c=s;c<=l;c++){let d=_e+(t[c]-r)*n[c];d<ye||d>he||(e.moveTo(d,de),e.lineTo(d,de+ge))}e.stroke()}function rp(e,t,n,r,o){if(o<=1)return 0;let i;if(e>=150)i=2;else if(e>=50)i=1;else return 0;if(r<=0)return 0;let a=r*2/i,s=r/i;return Math.abs(t-n)%a>=s?0:1}function Ys(e,t){let n={time:0,beatLength:500};for(let r of e){if(r.time>t)break;r.inherited||(n={time:r.time,beatLength:r.beatLength})}return n}function op(e,t){let n=e.length;if(n===0)return 0;let r=0,o=n;for(;r<o;){let i=r+o>>>1;e[i].time<=t?r=i+1:o=i}return r>0?e[r-1].combo:0}function Rs(e,t){let n=[];for(let o=0;;o++){let i=ke(e,`${t}-${o}`);if(i===void 0)break;n.push(i)}if(n.length>0)return n;let r=ke(e,t);return r!==void 0?[r]:[]}var Ps=100;function _s(e,t,n,r,o,i,a,s,l,u){let d=(t.isStrong?To:Qn)*o,m=t.isRim?Bf:Hf,f=t.isStrong?"taikobigcircle":"taikohitcircle",h=t.isStrong?"taikobigcircleoverlay":"taikohitcircleoverlay",p=s?Pe(s.images,f):void 0,b=e.globalAlpha;if(i<1&&(e.globalAlpha=b*i),p!==void 0){let S=d*2;if(yo(e,qn(p,m),n,r,S),s!==void 0){let g=Rs(s.images,h),v=g.length>0?g:t.isStrong?Rs(s.images,"taikohitcircleoverlay"):[];if(v.length>0){let x=0;if(v.length>1){let y=Ys(l.timingPoints,t.time);x=rp(u,a,y.time,y.beatLength,v.length)}let k=Vs(s.images,f,p),M=v[x];Xs(e,M.bitmap,M.pixelScale,n,r,k,S)}}}else e.fillStyle=m,e.beginPath(),e.arc(n,r,d,0,Math.PI*2),e.fill(),e.strokeStyle="rgba(255,255,255,0.92)",e.lineWidth=t.isStrong?3:2,e.stroke();i<1&&(e.globalAlpha=b)}function ip(e,t,n,r,o,i,a,s,l){let u=t.isStrong?To:Qn,c=i.get(t.noteId);if(c!==void 0&&n>=c.time){if(l)return;if(c.judgement===0){let f=n-c.time;if(f>=Ps)return;let h=Mt(t.time,n,r);if(h<ye-u-4||h>he+u+4)return;let p=1-f/Ps;_s(e,t,h,ce,1,p,n,o,a,s)}return}let d=Mt(t.time,n,r);if(d<ye-u-4||d>he+u+4)return;let m=l?zf(t.time,n,r):1;m<=0||_s(e,t,d,ce,1,m,n,o,a,s)}var Ls=new WeakMap,ap=Object.freeze([]);function sp(e,t){let n=Ls.get(e);if(n===void 0){n=new Map;for(let r of e){if(!r.comboIgnore||r.strong===!0)continue;let o=n.get(r.objectIndex);o===void 0&&(o=[],n.set(r.objectIndex,o)),o.push({time:r.time,isRim:(r.hitSound&8)!==0})}Ls.set(e,n)}return n.get(t)??ap}var Os=new WeakMap;function lp(e,t){let n=Os.get(e);n||(n=new WeakMap,Os.set(e,n));let r=n.get(t);if(r)return r;let o=[],i=e.tickInterval/2,a=sp(t,e.sourceIndex),s=0,l=0;for(let u=0;u<e.tickCount&&!(s===0&&(l>=a.length||(u=Math.max(u,Math.ceil((a[l].time-i-e.time)/e.tickInterval)),u>=e.tickCount)));u++){let c=e.time+u*e.tickInterval,d=c+i;for(;l<a.length&&a[l].time<c-i;)l++;let m=!1,f;l<a.length&&a[l].time<=d?(m=!0,f=a[l].time,l++):f=d;let h=s;s=m?Math.min($s,s+1):Math.max(0,s-1),s!==h&&o.push({time:f,before:h,after:s})}return n.set(t,o),o}function cp(e,t,n){let r=lp(e,t),o=0,i=r.length;for(;o<i;){let b=Math.floor((o+i)/2);r[b].time<=n?o=b+1:i=b}let a=r[o-1],s=a?.time??-1/0,l=a?.before??0,u=a?.after??0,c=isFinite(s)?Math.max(0,Math.min(1,(n-s)/Ff)):1,m=(l+(u-l)*c)/$s,f=Math.round(wt.r+(ho.r-wt.r)*m),h=Math.round(wt.g+(ho.g-wt.g)*m),p=Math.round(wt.b+(ho.b-wt.b)*m);return`rgb(${f}, ${h}, ${p})`}function up(e,t,n,r,o,i){let a=cp(t,i,n),s=Mt(t.time,n,r),l=Mt(t.endTime,n,r),u=t.isStrong?To:Qn,c=o?Pe(o.images,"taiko-roll-middle"):void 0,d=o?Pe(o.images,"taiko-roll-end"):void 0,m=t.isStrong?"taikobigcircle":"taikohitcircle",f=t.isStrong?"taikobigcircleoverlay":"taikohitcircleoverlay",h=o?Pe(o.images,m):void 0,p=o?Pe(o.images,f):void 0,b=o?Pe(o.images,"sliderscorepoint"):void 0,S=l>ye-4&&s<he+u+4;if(S&&c!==void 0&&d!==void 0){let M=u*2,y=d.width/d.height,w=M*y,T=s,C=l;if(C>T){let R=qn(c,a);e.drawImage(R,T,ce-M/2,C-T,M)}let E=qn(d,a);e.drawImage(E,l,ce-M/2,w,M)}else S&&(e.fillStyle=a,e.beginPath(),e.moveTo(s,ce-u),e.lineTo(l,ce-u),e.arc(l,ce,u,-Math.PI/2,Math.PI/2),e.lineTo(s,ce+u),e.closePath(),e.fill(),e.strokeStyle="rgba(255,255,255,0.55)",e.lineWidth=1,e.stroke());let g=n+(ye-4-_e)/r,v=n+(he+4-_e)/r,x=r===0?0:Math.max(0,Math.ceil((Math.min(g,v)-t.time)/t.tickInterval)),k=r===0?t.tickCount-1:Math.min(t.tickCount-1,Math.floor((Math.max(g,v)-t.time)/t.tickInterval));for(let M=x;M<=k;M++){let y=t.time+M*t.tickInterval,w=Mt(y,n,r);w<ye-4||w>he+4||(b!==void 0?yo(e,b,w,ce,10):(e.fillStyle="rgba(255,255,255,0.55)",e.beginPath(),e.arc(w,ce,3,0,Math.PI*2),e.fill()))}if(s>=ye-u-4&&s<=he+u+4)if(h!==void 0){let M=u*2;if(yo(e,qn(h,a),s,ce,M),p!==void 0){let y=Vs(o.images,m,h),w=o.images.has(`${f}@2x.png`)?.5:1;Xs(e,p,w,s,ce,y,M)}}else e.fillStyle=a,e.beginPath(),e.arc(s,ce,u,0,Math.PI*2),e.fill(),e.strokeStyle="rgba(255,255,255,0.92)",e.lineWidth=t.isStrong?3:2,e.stroke()}var dp=250,mp=100,tr=.8,Ds=1.86*tr,Hs=.1*tr,fp=.8,bo=200,go=300,pp=.02,Bs=.94-tr,Fs=240,hp=Math.PI,bp=-40,gp=-90*(768/480),yp=240,Sp=120,vp=130;function ke(e,t){let n=e.get(`${t}@2x.png`);if(n!==void 0&&n.width>1)return{bitmap:n,pixelScale:.5};let r=e.get(`${t}.png`);if(r!==void 0&&r.width>1)return{bitmap:r,pixelScale:1}}function xt(e,t,n,r,o){let i=t.bitmap.width*t.pixelScale*o*pe,a=t.bitmap.height*t.pixelScale*o*pe;e.drawImage(t.bitmap,n-i/2,r-a/2,i,a)}function wp(e,t){return ke(e,`score-${t}`)}function xp(e,t,n,r,o,i){let a=[],s=0,l=0;for(let c of n){let d=wp(t,c);if(d===void 0)return;a.push(d),s+=d.bitmap.width*d.pixelScale*i*pe;let m=d.bitmap.height*d.pixelScale*i*pe;m>l&&(l=m)}let u=r-s/2;for(let c of a){let d=c.bitmap.width*c.pixelScale*i*pe,m=c.bitmap.height*c.pixelScale*i*pe;e.drawImage(c.bitmap,u,o-m/2,d,m),u+=d}}function Mp(e,t,n,r,o,i){if(i===void 0)return;let a=ke(i.images,"spinner-warning"),s=ke(i.images,"spinner-circle"),l=ke(i.images,"spinner-approachcircle"),u=ke(i.images,"spinner-osu");if(a===void 0&&s===void 0&&l===void 0&&u===void 0)return;let c=0;if(o!==void 0)for(let T of o.tickTimes)if(T<=n)c++;else break;let d=Math.max(0,t.requiredHits-c),m=o?.completionTime??t.endTime,f=o?.completionTime!==void 0,h=m+go,p=t.time-4e3;if(n<p||n>h)return;let b=Mt(t.time,n,r),S=n>=t.time?Math.max(_e,b):b,g=ce,v=dp*pe,x=mp*pe,k=S+v,M=g+x,y=800;if(S>he+y||S<ye-y)return;let w=1;if(n>m){let T=(n-m)/go,C=1-Math.min(1,T);if(w=C*C,w<=0)return}if(e.save(),e.globalAlpha=w,a!==void 0&&n<t.time+bo){let T=n-t.time,C=S,E=g,R=1,D=1;if(T>=0){let _=T/bo;C=S+v*_,E=g+x*_,R=1+2*_,D=1-_}D>0&&(e.save(),e.globalAlpha*=D,xt(e,a,C,E,R),e.restore())}if(n>=t.time){let T=n-t.time,C=Math.max(1,t.endTime-t.time),E=Math.min(1,T/bo);if(l!==void 0){let _=Math.min(1,T/C),P=Ds+(Hs-Ds)*_;f&&n>=m&&(P=Hs),e.save(),e.globalAlpha*=fp*E,xt(e,l,k,M,P),e.restore()}if(s!==void 0){let _=0;if(o!==void 0)for(let H=o.tickTimes.length-1;H>=0;H--){let I=o.tickTimes[H];if(I>n)continue;let B=n-I;if(B>=Fs)break;if(_+=pp*(1-B/Fs),_>=Bs){_=Bs;break}}let P=tr+_;if(f&&n>=m){let H=n-m,I=Math.min(1,H/go),B=1-(1-I)*(1-I);P+=.05*B}let U=c*hp;e.save(),e.globalAlpha*=E,e.translate(k,M),e.rotate(U),xt(e,s,0,0,P),e.restore()}let R=t.requiredHits>0?1.6-.6*(d/t.requiredHits):1.6,D=M+vp*pe;e.save(),e.globalAlpha*=E,xp(e,i.images,String(d),k,D,R),e.restore()}if(f&&u!==void 0){let T=n-o.completionTime;if(T>=0){let C=Math.min(1,T/yp),E=Math.min(1,T/Sp),R=(bp+gp*C)*pe;e.save(),e.globalAlpha*=E,xt(e,u,k,M+R,1),e.restore()}}e.restore()}function Tp(e,t,n,r,o,i,a,s,l,u){t.kind==="hit"?ip(e,t,n,r,o,i,a,s,u):t.kind==="drumroll"&&up(e,t,n,r,o,l)}function Cp(e,t){let n=!1,r=-1/0,o=!1;for(let i of e){if(i.time>t)break;i.kiai!==n&&(r=i.time,o=i.kiai,n=i.kiai)}return{transitionTime:r,kiaiOn:o}}var Ns=.6,kp=de+.2*ge,Ip=4,Ks=100,vo=[0,1,2,3,4,5,6,5,6,5,4,3,2,1,0],wo=Ks*vo.length;function Ep(e,t){let n=[];for(let r=0;;r++){let o=ke(e,`${t}${r}`);if(o!==void 0){n.push(o);continue}if(r===0){let i=ke(e,t);if(i!==void 0){n.push(i);continue}}break}return n}function Ws(e,t){let n=e.length;if(n===0)return;let r=0,o=n;for(;r<o;){let i=r+o>>>1;e[i].time<=t?r=i+1:o=i}for(let i=r-1;i>=0;i--){let a=e[i];if(!a.comboIgnore)return a}}function Ap(e,t,n){let r=t.length,o=0,i=r;for(;o<i;){let c=o+i>>>1;t[c].time<=n?o=c+1:i=c}let a=-1/0;for(let c=o-1;c>=0;c--){let d=t[c];if(n-d.time>wo+16)break;if(d.combo>0&&d.combo%50===0){a=d.time;break}}let s=e.length,l=0,u=s;for(;l<u;){let c=l+u>>>1;e[c].time<=n?l=c+1:u=c}for(let c=l-1;c>=0;c--){let d=e[c];if(n-d.time>wo+16)break;if(d.comboIgnore&&d.strong===!0&&d.judgement>0){d.time>a&&(a=d.time);break}}return isFinite(a)?a:void 0}function Rp(e,t,n,r,o,i){if(i===void 0)return;let a=Ap(n,r,o),s,l=0;if(a!==void 0)if(l=o-a,l<wo)s="clear";else{let v=Ws(n,o),{kiai:x}=So(t.timingPoints,o);v&&v.judgement===0?s="fail":x?s="kiai":s="idle"}else{let v=Ws(n,o),{kiai:x}=So(t.timingPoints,o);v&&v.judgement===0?s="fail":x?s="kiai":s="idle"}let u=`pippidon${s}`,c=Ep(i.images,u);if(c.length===0)return;let d;if(s==="clear"){let v=Math.min(vo.length-1,Math.floor(l/Ks)),x=vo[v];d=Math.min(x,c.length-1)}else{let v=Ys(t.timingPoints,o);d=((v.beatLength>0?Math.floor((o-v.time)/v.beatLength):0)%c.length+c.length)%c.length}let m=c[d],f=m.bitmap.width*m.pixelScale,h=m.bitmap.height*m.pixelScale,p=f*Ns,b=h*Ns,S=Ip,g=kp-b;e.drawImage(m.bitmap,S,g,p,b)}function Pp(e,t){let n={LeftRim:-1/0,LeftCentre:-1/0,RightCentre:-1/0,RightRim:-1/0},r=e.length;if(r===0)return n;let o=t-Df,i=0,a=r;for(;i<a;){let s=i+a>>>1;e[s].time<o?i=s+1:a=s}for(let s=i;s<r;s++){let l=e[s];if(l.time>t)break;l.time>n[l.action]&&(n[l.action]=l.time)}return n}function _p(e,t,n,r){Ji(e,Pp(t,n),n,r?.images,0,de,Zn,ge)}function qs(e,t,n,r){let o=t.objectVel,i=t.barLineVel,a=t.maxScrollMs,s=t.skin,l=op(t.comboFrames,n),u=r.modHidden,c=Va(t.objects),d=Xn(r,"taiko");qf(e,s,t.beatmap.timingPoints,n,d),tp(e,s),e.save(),e.beginPath(),e.rect(ye,0,he-ye,xo),e.clip(),e.save(),e.globalAlpha*=d,np(e,t.barLines,i,n,a,c,s),e.restore();let{firstIdx:m,lastIdx:f}=Yf(t.objects,n,a,c);for(let h=f;h>=m;h--)Tp(e,t.objects[h],n,o[h],s,t.hitJudgmentByNote,t.beatmap,l,t.hitResults,u);e.restore(),_p(e,t.inputEvents,n,s);for(let h=f;h>=m;h--){let p=t.objects[h];p.kind==="swell"&&Mp(e,p,n,o[h],t.swellProgress.get(p.sourceIndex),s)}Rp(e,t.beatmap,t.hitResults,t.comboFrames,n,s),r.modFlashlight&&Lp(t).draw(e,n)}var js=new WeakMap;function Lp(e){if(e.flashlight!==null)return e.flashlight;let t=js.get(e);return t===void 0&&(t=new vt(e.beatmap,e.comboFrames),js.set(e,t)),t}var Op=30;function nr(e){return e==="LeftCentre"||e==="RightCentre"}function Js(e){return e==="LeftCentre"||e==="LeftRim"}function Zs(e,t){let{objects:n,inputEvents:r}=e,o=t.taikoHitWindowGreat,i=t.taikoHitWindowOk,a=t.taikoHitWindowMiss,s=[],l=[],u=[];for(let g of n)g.kind==="hit"?s.push(g):g.kind==="drumroll"?l.push(g):u.push(g);let c=l.map(()=>new Set),d=u.map(g=>({lastWasRim:null,remaining:g.requiredHits,completed:!1})),m=new Array(r.length).fill(!1),f=[],h=[];function p(g){f.push({objectIndex:g.sourceIndex,noteId:g.noteId,judgement:0,time:g.time+i,x:Tt,y:Ct,hitSound:g.hitSound,comboBreak:!0})}let b=0,S=Number.NaN;for(let g=0;g<r.length;g++){if(m[g])continue;let v=r[g];if(v.time===S)continue;for(;b<s.length&&s[b].time+i<v.time;)p(s[b]),b++;if(b<s.length){let M=s[b],y=v.time-M.time;if(y>=-a&&y<=a){let w=nr(v.action),T=w===!M.isRim,C=Math.abs(y),E;T?C<o?E=300:C<i?E=100:E=0:E=0;let R=!1,D=0;if(M.isStrong&&E!==0)for(let P=g+1;P<r.length;P++){if(m[P])continue;let U=r[P];if(U.time-v.time>=Op)break;let I=nr(U.action)===w,B=Js(U.action)!==Js(v.action);if(I&&B){R=!0,D=U.time,m[P]=!0;break}}let _={objectIndex:M.sourceIndex,noteId:M.noteId,judgement:E,time:v.time,x:Tt,y:Ct,hitSound:M.hitSound,comboBreak:E===0};R&&(_.strong=!0,_.strongSecondHitTime=D),f.push(_),E!==0&&(S=v.time),b++;continue}}let x=!1;for(let M=0;M<l.length;M++){let y=l[M];if(v.time<y.time)break;if(v.time>y.endTime)continue;let w=c[M],T=y.tickInterval/2,C=-1,E=1/0,R=(v.time-y.time)/y.tickInterval;for(let D=Math.max(0,Math.floor(R));D<=Math.min(y.tickCount-1,Math.ceil(R));D++){if(w.has(D))continue;let _=Math.abs(v.time-(y.time+D*y.tickInterval));_<E&&(E=_,C=D)}C>=0&&E<=T&&(w.add(C),f.push({objectIndex:y.sourceIndex,judgement:300,time:v.time,x:Tt,y:Ct,hitSound:nr(v.action)?0:8,comboBreak:!1,comboIgnore:!0})),x=!0;break}if(x)continue;let k=!1;for(let M=0;M<u.length;M++){let y=u[M];if(v.time<y.time)break;if(v.time>y.endTime)continue;k=!0;let w=d[M];if(!w.completed){let T=!nr(v.action);(w.lastWasRim===null||w.lastWasRim!==T)&&(w.lastWasRim=T,w.remaining--,f.push({objectIndex:y.sourceIndex,judgement:300,time:v.time,x:Tt,y:Ct,hitSound:T?8:0,comboBreak:!1,comboIgnore:!0}),w.remaining<=0&&(w.completed=!0,f.push({objectIndex:y.sourceIndex,judgement:300,time:v.time,x:Tt,y:Ct,hitSound:y.hitSound,comboBreak:!1,comboIgnore:!0,strong:!0})))}break}k||h.push(v)}for(;b<s.length;)p(s[b]),b++;return f.sort((g,v)=>g.time-v.time),{results:f,ghostTaps:h}}var Qs={build(e,t,n,r,o){let i=Rn(e),a=t.mode===1?ys(t):[],s=Gs(e),l=n.isConstantSpeed,u=zs(n),c=new Array(i.length),d=1/0;for(let y=0;y<i.length;y++){let w=Co(e,i[y].time,l,u);c[y]=w,w>0&&w<d&&(d=w)}let m=new Array(s.length);for(let y=0;y<s.length;y++){let w=Co(e,s[y],l,u);m[y]=w,w>0&&w<d&&(d=w)}let f=isFinite(d)&&d>0?er/d:5e3,h={beatmap:e,replay:t,modDiff:n,skin:r,objects:i,inputEvents:a,ghostTaps:[],barLines:s,objectVel:c,barLineVel:m,maxScrollMs:f,hitResults:[],comboFrames:[],swellProgress:new Map,hitJudgmentByNote:new Map,flashlight:null},{results:p,ghostTaps:b}=Zs(h,n),S=new Set;for(let y of i)y.kind==="swell"&&S.add(y.sourceIndex);let g=new Map;for(let y of p){if(!y.comboIgnore||!S.has(y.objectIndex))continue;let w=g.get(y.objectIndex);w===void 0&&(w={tickTimes:[]},g.set(y.objectIndex,w)),y.strong?w.completionTime=y.time:w.tickTimes.push(y.time)}let v=new Map;for(let y of p)y.comboIgnore||y.noteId===void 0||v.set(y.noteId,{time:y.time,judgement:y.judgement});let x={...h,hitResults:p,ghostTaps:b,swellProgress:g,hitJudgmentByNote:v},k=Xe(p),M=n.isFL?new vt(e,k):null;return{...x,comboFrames:k,flashlight:M}},draw(e,t,n,r){qs(e,t,n,r)},hitResults:e=>e.hitResults,comboFrames:e=>e.comboFrames};function el(e,t){let n=[];if(t<=0)return n;let r=t>=32?-1>>>0:(1<<t)-1,o=0,i=0;for(let a of e.frames){o+=a.timeDelta;let s=(a.x|0)&r,l=s&~i,u=~s&i;if(l!==0||u!==0)for(let c=0;c<t;c++){let d=1<<c;l&d&&n.push({time:o,column:c,kind:"press"}),u&d&&n.push({time:o,column:c,kind:"release"})}i=s}return n}function Dp(e){let t=e.timingPoints.filter(a=>!a.inherited);if(t.length===0)return 1e3;let n=0;for(let a of e.hitObjects){let s=a.type==="spinner"?a.endTime:a.time;s>n&&(n=s)}for(let a of e.maniaHolds)a.endTime>n&&(n=a.endTime);let r=new Map;for(let a=0;a<t.length;a++){let s=t[a],l=a===0?0:s.time,u=a===t.length-1?n:t[a+1].time,c=Math.round(s.beatLength*1e3)/1e3;r.set(c,(r.get(c)??0)+(u-l))}let o=1e3,i=-1/0;for(let[a,s]of r)s>i&&(i=s,o=a);return o>0?o:1e3}function tl(e){let t=e.timingPoints,n=Dp(e),r=[],o=[],i=1e3,a=1;for(let l of t){l.inherited?a=l.beatLength<0?100/-l.beatLength:1:(i=l.beatLength>0?l.beatLength:1e3,a=1);let u=a*n/i;r.length>0&&r[r.length-1]===l.time?o[o.length-1]=u:(r.push(l.time),o.push(u))}r.length===0&&(r.push(0),o.push(1));let s=new Array(r.length);s[0]=0;for(let l=1;l<r.length;l++)s[l]=s[l-1]+(r[l]-r[l-1])*o[l-1];return{times:r,multipliers:o,cumRaw:s}}function nl(e,t){if(t<e[0])return 0;let n=0,r=e.length-1;for(;n<r;){let o=n+r+1>>>1;e[o]<=t?n=o:r=o-1}return n}function ko(e,t){let n=nl(e.times,t);return e.cumRaw[n]+(t-e.times[n])*e.multipliers[n]}function Io(e,t){let n=nl(e.cumRaw,t);return e.times[n]+(t-e.cumRaw[n])/e.multipliers[n]}var _o=1280,te=720,Hp=80,Bp=70,Fp=0,Np=110,Wp=11485,sn=te/480,jp=te/768,Up=2,$p="#ffffffff",Vp="#ffffffff",Xp=.9,rl=2,zp=.74,Gp=0,Yp=4;function Ao(e,t){return e.columns%2!==1?!1:t-e.firstColumnIndex===Math.floor(e.columns/2)}function Kp(e,t){if(Ao(e,t))return"S";let n=t-e.firstColumnIndex,r=e.firstColumnIndex+e.columns-1-t;return Math.min(n,r)%2===0?"1":"2"}function Lo(e,t){let n=e?.config.maniaSections;if(n!==void 0){for(let r of n)if(r.keys===t)return r}}function sl(e,t){return Lo(e,t)?.upsideDown===!0}function qp(e){let t=e?.noteBodyStyle;return t!==void 0&&t!==Gp}function Jp(e,t,n){let r=n.toLowerCase(),o=e?.imageLookups,i=`noteimage${t}`,a=`noteimage${t}h`,s=`noteimage${t}t`,l=`noteimage${t}l`,u=`keyimage${t}`,c=`keyimage${t}d`,d=o?.[i],m=o?.[a],f=o?.[s],h=o?.[l],p=o?.[u],b=o?.[c],S=h??`mania-note${r}l`,g=d??`mania-note${r}`,v=m??d??`mania-note${r}h`,x=f??m??d??`mania-note${r}t`,k=p??`mania-key${r}`,M=b??`mania-key${r}d`;return{noteStem:g,headStem:v,tailStem:x,bodyStem:S,keyStem:k,keyDownStem:M}}function ll(e,t,n){let r=Lo(n,t),o=new Array(t),i=e[0];for(let f=0;f<t;f++){let h=Ao(i,f),p=r?.columnWidth?.[f];o[f]=p!==void 0&&p>0?p*sn:h?Bp:Hp}let a=new Array(Math.max(0,t-1));for(let f=0;f<a.length;f++){let h=r?.columnSpacing?.[f];a[f]=h!==void 0&&h>0?h*sn:Fp}let s=0;for(let f=0;f<t;f++)s+=o[f],f<t-1&&(s+=a[f]);let l=Math.round((_o-s)/2),u=new Array(t),c=l;for(let f=0;f<t;f++){let h=Ao(i,f),p=Kp(i,f),b=Jp(r,f,p);u[f]={x:c,width:o[f],isSpecial:h,textureSuffix:p,...b},c+=o[f],f<t-1&&(c+=a[f])}let d=Np;r?.hitPosition!==void 0&&(d=(480-Math.max(240,Math.min(480,r.hitPosition)))*sn);let m=te-d;return{columns:u,stageLeftX:l,stageRightX:c,hitTargetY:m,scrollLength:m}}function rr(e,t,n,r,o){let i=(ko(e,n)-t)/r*o.scrollLength;return o.hitTargetY-i}var Zp=250,Qp=300;function cl(e,t,n,r){let o=n/r.scrollLength,i=Io(e,t+(r.scrollLength+Zp)*o);return{minTime:Io(e,t-Qp*o),maxTime:i}}function Oo(e){return e.replace(/@2x/gi,"")}function Le(e,t){if(e===void 0||t==="")return;let n=Oo(t);return e.images.get(`${n}@2x.png`)??e.images.get(`${n}.png`)}function ol(e,t){if(e===void 0||t==="")return;let n=Oo(t),r=e.images.get(`${n}@2x.png`);if(r!==void 0&&r.width>1)return{bitmap:r,pixelScale:.5};let o=e.images.get(`${n}.png`);if(o!==void 0&&o.width>1)return{bitmap:o,pixelScale:1}}function eh(e,t){if(e===void 0||t==="")return;let n=Oo(t),r=e.images.get(`${n}@2x.png`);if(r!==void 0)return r.width>1?{bitmap:r,pixelScale:.5}:null;let o=e.images.get(`${n}.png`);if(o!==void 0)return o.width>1?{bitmap:o,pixelScale:1}:null}function Ro(e,t,n){let r=Le(e,t);if(r!==void 0)return r;if(n!==void 0&&n!==t)return Le(e,n)}function th(e,t,n){let r=e.length;if(r===0)return{firstIdx:0,lastIdx:-1};let o=0,i=r;for(;o<i;){let s=o+i>>>1;e[s].time<t?o=s+1:i=s}let a=o;if(a>=r||e[a].time>n)return{firstIdx:a,lastIdx:a-1};for(o=a,i=r-1;o<i;){let s=o+i+1>>>1;e[s].time<=n?o=s:i=s-1}return{firstIdx:a,lastIdx:o}}function nh(e,t,n){e.fillStyle="rgb(0, 0, 0)",e.fillRect(t.stageLeftX,0,t.stageRightX-t.stageLeftX,te);for(let r=0;r<t.columns.length;r++){let o=t.columns[r],i=n?.colours[r];e.fillStyle=i??"rgba(0, 0, 0, 0.55)",e.fillRect(o.x,0,o.width,te)}}function rh(e,t,n,r){let o=t.stageRightX-t.stageLeftX,i=r?.imageLookups.stageleft??"mania-stage-left",a=r?.imageLookups.stageright??"mania-stage-right",s=Le(n,i),l=Le(n,a);if(s!==void 0&&s.width>1){let m=s.width/s.height,f=te*m;e.drawImage(s,t.stageLeftX-f,0,f,te)}if(l!==void 0&&l.width>1){let m=l.width/l.height,f=te*m;e.drawImage(l,t.stageRightX,0,f,te)}let u=r?.imageLookups.stagehint??"mania-stage-hint",c=Le(n,u);if(c!==void 0&&c.width>1){let m=c.height/c.width,f=o*m;e.drawImage(c,t.stageLeftX,t.hitTargetY-f/2,o,f)}if(r?.judgementLine??!0){let m=r?.judgementLineColour??Vp,f=e.globalAlpha;e.globalAlpha=f*Xp,e.fillStyle=m,e.fillRect(t.stageLeftX,t.hitTargetY-rl/2,o,rl),e.globalAlpha=f}}function oh(e,t,n){let r=t.columns.length,o=n?.columnLineWidth,i=n?.colourColumnLine??$p;for(let a=0;a<=r;a++){let s=o!==void 0?o[a]:Up;if(s===void 0||s<=0)continue;let l=s*sn*zp,u;if(a===0)u=t.columns[0].x;else if(a===r)u=t.columns[r-1].x+t.columns[r-1].width;else{let c=t.columns[a-1],d=t.columns[a];u=(c.x+c.width+d.x)/2}e.fillStyle=i,e.fillRect(u-l/2,0,l,t.hitTargetY)}}function ih(e,t,n){let r=t.stageRightX-t.stageLeftX,o=Le(n,"mania-stage-bottom");if(o!==void 0){let i=o.height/o.width,a=r*i;e.drawImage(o,t.stageLeftX,te-a,r,a)}}function il(e,t,n,r){let o=te-t.hitTargetY;for(let i=0;i<t.columns.length;i++){let a=t.columns[i],s=r[i]===!0,l=s?a.keyDownStem:a.keyStem,u=s?`mania-key${a.textureSuffix.toLowerCase()}d`:`mania-key${a.textureSuffix.toLowerCase()}`,c;for(let d of[l,u,s?"mania-key1d":"mania-key1"])if(c=eh(n,d),c!==void 0)break;if(c!=null){let d=c.bitmap.height*c.pixelScale*jp;e.drawImage(c.bitmap,a.x,te-d,a.width,d)}else c===void 0&&(e.fillStyle=s?"rgba(160, 160, 200, 0.95)":"rgba(80, 80, 100, 0.85)",e.fillRect(a.x,t.hitTargetY,a.width,o),e.strokeStyle="rgba(255, 255, 255, 0.2)",e.lineWidth=1,e.strokeRect(a.x+.5,t.hitTargetY+.5,a.width-1,o-1))}}function ah(e,t,n,r,o,i,a){let s=a?.barlineHeight??1;if(s<=0)return;let{minTime:l,maxTime:u}=cl(n,r,o,i),{firstIdx:c,lastIdx:d}=th(t,l,u);if(d<c)return;let m=i.stageLeftX,f=i.stageRightX;for(let h=c;h<=d;h++){let p=t[h],b=rr(n,r,p.time,o,i);b<-2||b>i.hitTargetY+2||(p.major?(e.fillStyle="rgba(255, 255, 255, 0.30)",e.fillRect(m,b-s,f-m,s*2)):(e.fillStyle="rgba(255, 255, 255, 0.13)",e.fillRect(m,b,f-m,s)))}}function Po(e,t,n){return t===void 0?Math.round(e*.35):(n!==void 0?n*sn:e)*(t.height/t.width)}function sh(e,t,n,r,o){let i=Ro(r,t.noteStem,`mania-note${t.textureSuffix.toLowerCase()}`)??Le(r,"mania-note1"),a=Po(t.width,i,o);i!==void 0?e.drawImage(i,t.x,n-a,t.width,a):(e.fillStyle="rgba(220, 230, 255, 0.95)",e.fillRect(t.x,n-a,t.width,a))}var lh=30;function ch(e,t,n,r){let o=i=>{if(e===void 0||i==="")return;let a=Le(e,i);if(a!==void 0)return a;let s=fh(e,i);if(s.length===0)return;let l=Math.floor(r/lh)%s.length;return s[l>=0?l:l+s.length].bitmap};return o(t)??o(n)}function uh(e,t,n,r,o,i,a,s){let l=Ro(o,t.headStem,`mania-note${t.textureSuffix.toLowerCase()}`)??Le(o,"mania-note1"),u=ch(o,t.bodyStem,`mania-note${t.textureSuffix.toLowerCase()}l`,s)??Le(o,"mania-note1l")??l,c=Po(t.width,l,i),m=(t.tailStem!==t.headStem?Ro(o,t.tailStem):void 0)??l,f=Po(t.width,m,i),h=r-f/2,p=n-c/2,b=p-h;if(b>0&&u!==void 0)if(u.height>=u.width*Yp){let S=t.width*(u.height/u.width);e.save(),e.beginPath(),e.rect(t.x,h,t.width,b),e.clip(),e.drawImage(u,t.x,h,t.width,Math.max(S,b)),e.restore()}else if(a){let S=t.width*(u.height/u.width);if(S>0){e.save(),e.beginPath(),e.rect(t.x,h,t.width,b),e.clip();for(let g=p;g>h;g-=S)e.drawImage(u,t.x,g-S,t.width,S);e.restore()}}else e.drawImage(u,t.x,h,t.width,b);m!==void 0?(e.save(),e.translate(t.x+t.width/2,r-f/2),e.scale(1,-1),e.drawImage(m,-t.width/2,-f/2,t.width,f),e.restore()):(e.fillStyle="rgba(220, 230, 255, 0.95)",e.fillRect(t.x,r-f,t.width,f)),l!==void 0?e.drawImage(l,t.x,n-c,t.width,c):(e.fillStyle="rgba(220, 230, 255, 0.95)",e.fillRect(t.x,n-c,t.width,c))}function al(e,t,n,r,o,i){let{objects:a,layout:s,scroll:l,holdStates:u}=t,{minTime:c,maxTime:d}=cl(l,n,o,s),m=Xa(a,c,d);if(m.length===0)return;let f=qp(i),h=i?.widthForNoteHeightScale;for(let p of m){let b=s.columns[p.column];if(b!==void 0)if(p.kind==="note"){if(p.time<c)continue;let S=t.noteResultByIndex.get(p.sourceIndex);if(S!==void 0&&S.judgement>0&&r>=S.time)continue;let g=rr(l,n,p.time,o,s);if(g<-200||g>s.hitTargetY+200)continue;sh(e,b,g,t.skin,h)}else{if(p.endTime<c)continue;let S=rr(l,n,p.endTime,o,s);if(S>s.hitTargetY+200)continue;let g=u.get(p.sourceIndex),v=g!==void 0&&g.headJudgement>0&&g.pressedAt!==null,k=g?.releasedAt??null??p.endTime;if(v&&r>=k)continue;let M=v&&r>=g.pressedAt&&r<k,y;M?y=s.hitTargetY:y=rr(l,n,p.startTime,o,s);let w=M?Math.min(S,s.hitTargetY):S;uh(e,b,y,w,t.skin,h,f,r)}}}function dh(e,t){if(e.length===0)return null;let n=0,r=e.length;for(;n<r;){let o=n+r>>>1;e[o].start<=t?n=o+1:r=o}return n===0?null:e[n-1]}function mh(e,t){let n=dh(e,t);return n!==null&&t>=n.start&&t<n.end}function fh(e,t){if(e===void 0||t==="")return[];let n=[];for(let o=0;;o++){let i=ol(e,`${t}-${o}`);if(i===void 0)break;n.push(i)}if(n.length>0)return n;let r=ol(e,t);return r!==void 0?[r]:[]}function ph(e,t){let n=new Array(e.totalColumns);for(let r=0;r<e.totalColumns;r++)n[r]=mh(e.pressIntervals[r]??[],t);return n}var ul=768,hh=.25,bh=160,gh=400,yh=.5,Sh=50,vh=1.1,wh=2.5,xh=te/ul,Eo=null;function Mh(){return Eo??(Eo=new OffscreenCanvas(_o,te)),{canvas:Eo,ctx:Eo.getContext("2d")}}function dl(e,t){let n=0,r=e.length-1,o=-1;for(;n<=r;){let i=n+r>>1;e[i].time<=t?(o=i,n=i+1):r=i-1}return o>=0?e[o].combo:0}function ml(e,t){for(let n of e)if(t>=n.startTime&&t<=n.endTime)return!0;return!1}function Th(e,t,n){let r=e.modDiff;if(n.modCover)return{along:r.coverAlong,coverage:r.coverCoverage};if(n.modHidden||n.modFadeIn){if(ml(e.beatmap.breaks,t))return null;let o=dl(e.comboFrames,t),i=Math.min(gh,bh+o*yh);return{along:n.modFadeIn,coverage:i/ul}}return null}function Ch(e,t,n){let r=Math.max(0,Math.min(1,n.coverage)),o=hh,i=e.createLinearGradient(0,0,0,t),a=(s,l)=>i.addColorStop(Math.max(0,Math.min(1,s)),`rgba(255,255,255,${l})`);return n.along?(a(0,1),a(r,1),a(r+o,0),a(1,0)):(a(0,0),a(1-r-o,0),a(1-r,1),a(1,1)),i}function kh(e,t,n,r,o){let i=n>=200?.625:n>=100?.8125:1,s=Sh*o*(r?wh:i)*xh,l=te/2,u=t.stageLeftX,c=t.stageRightX-t.stageLeftX,d=s,m=s*vh,f=e.createLinearGradient(0,0,0,te),h=(p,b)=>f.addColorStop(Math.max(0,Math.min(1,p/te)),`rgba(0,0,0,${b})`);h(0,1),h(l-m,1),h(l-d,0),h(l+d,0),h(l+m,1),h(te,1),e.save(),e.fillStyle=f,e.fillRect(u,0,c,te),e.restore()}function fl(e,t,n,r){t=$a(t,r);let o=Xn(r,"mania"),i=Math.max(1,Math.min(40,r.maniaScrollSpeed)),a=Wp/i,s=r.maniaUpscroll,{layout:l,scroll:u}=t,c=ko(u,n),d=Lo(t.skin,t.totalColumns);s&&(e.save(),e.translate(0,te),e.scale(1,-1)),e.save(),e.globalAlpha*=o,nh(e,l,d),e.restore(),e.save(),e.globalAlpha*=o,oh(e,l,d),e.restore();let m=d?.keysUnderNotes??!1,f=ph(t,n);m&&il(e,l,t.skin,f);let h=l.stageRightX-l.stageLeftX;e.save(),e.beginPath(),e.rect(l.stageLeftX,0,h,l.hitTargetY),e.clip(),e.save(),e.globalAlpha*=o,ah(e,t.barLines,u,c,a,l,d),e.restore(),e.restore();let p=Th(t,n,r);if(p){let{canvas:b,ctx:S}=Mh();S.clearRect(0,0,_o,te),S.save(),S.beginPath(),S.rect(l.stageLeftX,0,h,l.hitTargetY),S.clip(),al(S,t,c,n,a,d),S.globalCompositeOperation="destination-out",S.fillStyle=Ch(S,l.scrollLength,p),S.fillRect(l.stageLeftX,0,h,l.scrollLength),S.restore(),e.drawImage(b,0,0)}else e.save(),e.beginPath(),e.rect(l.stageLeftX,0,h,l.hitTargetY),e.clip(),al(e,t,c,n,a,d),e.restore();if(e.save(),e.globalAlpha*=o,rh(e,l,t.skin,d),e.restore(),m||il(e,l,t.skin,f),e.save(),e.globalAlpha*=o,ih(e,l,t.skin),e.restore(),s&&e.restore(),r.modFlashlight){let b=dl(t.comboFrames,n),S=ml(t.beatmap.breaks,n);kh(e,l,b,S,1)}}function pl(e,t){return e<=t.maniaHitWindowPerfect?305:e<=t.maniaHitWindowGreat?300:e<=t.maniaHitWindowGood?200:e<=t.maniaHitWindowOk?100:e<=t.maniaHitWindowMeh?50:0}function hl(e,t){let{objects:n,inputEvents:r,totalColumns:o}=e,i=t.maniaHitWindowMiss,a=t.maniaHitWindowMeh,s=a*1.5,l=Array.from({length:o},()=>[]);for(let m of n){let f=l[m.column];f!==void 0&&f.push(m)}let u=Array.from({length:o},()=>[]);for(let m of r){let f=u[m.column];f!==void 0&&f.push(m)}let c=[],d=new Map;for(let m=0;m<o;m++){let f=l[m],h=u[m],p=0,b=null,S=!1,g=y=>y.kind==="note"?y.time:y.startTime,v=(y,w)=>{if(y.kind==="note"){c.push({objectIndex:y.sourceIndex,judgement:0,time:w,x:0,y:0,hitSound:y.hitSound,comboBreak:!0});return}c.push({objectIndex:y.sourceIndex,judgement:0,subResult:"head",time:w,x:0,y:0,hitSound:y.hitSound,comboBreak:!0}),c.push({objectIndex:y.sourceIndex,judgement:0,subResult:"body",time:y.endTime,x:0,y:0,hitSound:0,comboBreak:!0}),c.push({objectIndex:y.sourceIndex,judgement:0,subResult:"tail",time:y.endTime+s,x:0,y:0,hitSound:y.hitSound,comboBreak:!0}),d.set(y.sourceIndex,{headJudgement:0,pressedAt:null,releasedAt:null})},x=y=>{for(;p<f.length;){let w=f[p],T=g(w);if(T+a>=y)break;v(w,T+a),p++}},k=y=>{b!==null&&(c.push({objectIndex:b.sourceIndex,judgement:0,subResult:"tail",time:y,x:0,y:0,hitSound:b.hitSound,comboBreak:!0}),c.push({objectIndex:b.sourceIndex,judgement:0,subResult:"body",time:b.endTime,x:0,y:0,hitSound:0,comboBreak:!0}),b=null)},M=y=>{if(b===null)return;let w=b.endTime+s;w>=y||k(w)};for(let y of h)if(x(y.time),M(y.time),y.kind==="press"){for(;p<f.length;){let R=f[p+1];if(R===void 0||y.time<g(R))break;v(f[p],y.time),p++}if(p>=f.length)continue;let w=f[p],T=g(w),C=y.time-T;if(C<-i)continue;let E=pl(Math.abs(C),t);E>0&&b!==null&&b.endTime<=T&&k(y.time),w.kind==="note"?(c.push({objectIndex:w.sourceIndex,judgement:E,time:y.time,x:0,y:0,hitSound:w.hitSound,comboBreak:E===0}),p++):(c.push({objectIndex:w.sourceIndex,judgement:E,subResult:"head",time:y.time,x:0,y:0,hitSound:w.hitSound,comboBreak:E===0}),d.set(w.sourceIndex,{headJudgement:E,pressedAt:y.time,releasedAt:null}),b=w,S=!1,p++)}else{if(b===null)continue;let w=y.time-b.endTime,T=w/1.5,C=Math.abs(T);if(T<-i){S=!0;continue}let E=pl(C,t),R=d.get(b.sourceIndex),D=S||w<0&&C>a;((R?.headJudgement??0)===0||D)&&E>50&&(E=50);let U=D?0:300;c.push({objectIndex:b.sourceIndex,judgement:E,subResult:"tail",time:y.time,x:0,y:0,hitSound:b.hitSound,comboBreak:E===0}),c.push({objectIndex:b.sourceIndex,judgement:U,subResult:"body",time:y.time,x:0,y:0,hitSound:0,comboBreak:U===0,...U===300?{comboIgnore:!0}:{}}),R!==void 0&&(R.releasedAt=y.time),b=null}x(Number.POSITIVE_INFINITY),M(Number.POSITIVE_INFINITY)}return c.sort((m,f)=>m.time-f.time),{results:c,holdStates:d}}function Ih(e,t,n){if(e.head===void 0||e.head===0||e.tail===void 0||e.tail===0||e.bodyBroken)return 0;let r=Math.abs((e.headTime??t.startTime)-t.startTime),o=Math.abs((e.tailTime??t.endTime)-t.endTime),i=r+o,a=n.maniaHitWindowPerfect,s=n.maniaHitWindowGreat,l=n.maniaHitWindowGood,u=n.maniaHitWindowOk;return r<=a*1.2&&i<=a*2.4?305:r<=s*1.1&&i<=s*2.2?300:r<=l&&i<=l*2?200:r<=u&&i<=u*2?100:50}function Eh(e,t,n){let r=new Map,o=new Map,i=[];for(let s of t)s.kind==="hold"&&o.set(s.sourceIndex,s);for(let s of e){if(s.subResult===void 0){i.push({time:s.time,judgement:s.judgement});continue}let l=r.get(s.objectIndex);l===void 0&&(l={bodyBroken:!1,resolveTime:s.time},r.set(s.objectIndex,l)),s.time>l.resolveTime&&(l.resolveTime=s.time),s.subResult==="head"?(l.head=s.judgement,l.headTime=s.time):s.subResult==="tail"?(l.tail=s.judgement,l.tailTime=s.time):s.subResult==="body"&&s.judgement===0&&(l.bodyBroken=!0)}let a=[...i];for(let[s,l]of r){let u=o.get(s);if(u===void 0)continue;let c=Ih(l,u,n);a.push({time:l.resolveTime,judgement:c})}return a.sort((s,l)=>s.time-l.time),a}function bl(e,t,n){if(n.isLazer){let a=[...e].sort((u,c)=>u.time-c.time),s=[],l=0;for(let u of a)u.comboIgnore||(u.comboBreak?l=0:u.judgement>0&&(l+=1),s.push({time:u.time,combo:l}));return s}let r=Eh(e,t,n),o=[],i=0;for(let a of r)a.judgement===0?i=0:i+=1,o.push({time:a.time,combo:i});return o}var gl={build(e,t,n,r,o){let{stages:i,totalColumns:a,objects:s}=Vt(e,n),l=Gi(e),u=t.mode===3?el(t,a):[],c=ll(i,a,r),d=tl(e),m=0;for(let M of s)if(M.kind==="hold"){let y=M.endTime-M.startTime;y>m&&(m=y)}let f=Array.from({length:a},()=>[]),h=new Array(a).fill(null);for(let M of u){let y=M.column;if(!(y<0||y>=a))if(M.kind==="press")h[y]===null&&(h[y]=M.time);else{let w=h[y];w!=null&&(f[y].push({start:w,end:M.time}),h[y]=null)}}for(let M=0;M<a;M++){let y=h[M];y!=null&&f[M].push({start:y,end:Number.POSITIVE_INFINITY})}let p=new Map;for(let M of s)p.set(M.sourceIndex,M.column);let b=new Map;for(let M of s)b.set(M.sourceIndex,M.hitSample);let S={beatmap:e,replay:t,modDiff:n,skin:r,stages:i,totalColumns:a,defaultUpscroll:sl(r,a),objects:s,barLines:l,inputEvents:u,layout:c,scroll:d,maxHoldDurationMs:m,pressIntervals:f,objectIndexToColumn:p,samplesBySource:b,holdStates:new Map,hitResults:[],noteResultByIndex:new Map,comboFrames:[]},{results:g,holdStates:v}=hl(S,n),x=new Map;for(let M of g)M.subResult===void 0&&x.set(M.objectIndex,M);let k=bl(g,s,n);return{...S,hitResults:g,holdStates:v,noteResultByIndex:x,comboFrames:k}},draw(e,t,n,r){fl(e,t,n,r)},hitResults:e=>e.hitResults,comboFrames:e=>e.comboFrames};function yl(e){let t=[],n=0;for(let r=0;r<e.frames.length;r++){let o=e.frames[r];n+=o.timeDelta,!(r<2&&o.x===256&&o.y===-500)&&t.push({time:n,x:o.x,dash:o.keys===1})}return t}function Do(e){return e<0?0:e>512?512:e}function Ge(e,t){let n=e.length;if(n===0)return 256;if(t<=e[0].time)return Do(e[0].x);let r=e[n-1];if(t>=r.time)return Do(r.x);let o=0,i=n-1;for(;i-o>1;){let c=o+i>>1;e[c].time<=t?o=c:i=c}let a=e[o],s=e[o+1],l=s.time-a.time,u=l<=0?0:(t-a.time)/l;return Do(a.x+(s.x-a.x)*u)}function Ah(e,t,n,r){let o=Math.fround(Ge(e,t));return n>=Math.fround(o-r)&&n<=Math.fround(o+r)}function Sl(e,t,n){let r=Math.fround(gt(n)*.5),o=[...e].sort((a,s)=>a.startTime-s.startTime),i=[];for(let a of o){let s=Ah(t,a.startTime,a.effectiveX,r),l={objectIndex:a.sourceIndex,time:a.startTime,x:a.effectiveX,y:0,hitSound:a.hitSound,catchType:a.type};switch(a.type){case"fruit":i.push({...l,judgement:s?300:0,comboBreak:!s});break;case"droplet":i.push({...l,judgement:s?100:0,comboBreak:!s});break;case"tinyDroplet":i.push({...l,judgement:s?50:0,comboBreak:!1,comboIgnore:!0});break;case"banana":i.push({...l,judgement:s?300:0,comboBreak:!1,comboIgnore:!0});break}}return i}var Rh=1280,Ph=720,xl=203.125,Ml=1,vl=1.4,Bo=800,_h=2.5,Lh=100,Oh=200,Dh=.885,Hh=.77,Bh=Bo*2;function wl(e){return e>=Oh?Hh:e>=Lh?Dh:1}function Tl(e,t,n){if(e.length===0)return n;let r=0,o=e.length-1,i=-1;for(;r<=o;){let l=r+o>>1;e[l].tStart<=t?(i=l,r=l+1):o=l-1}if(i<0)return e[0].vStart;let a=e[i];if(t>=a.tEnd)return a.vEnd;let s=(t-a.tStart)/(a.tEnd-a.tStart);return a.vStart+(a.vEnd-a.vStart)*s}function Ho(e,t,n,r){let o=Tl(e,n,t);if(e.length>0){let i=e[e.length-1];i.tEnd>n&&(i.tEnd=n,i.vEnd=o)}e.push({tStart:n,tEnd:n+Bo,vStart:o,vEnd:r})}function Fh(e,t){let n=[],r=xl*Ml,o=[],i=1;for(let s of t){let l=wl(s.combo);l!==i&&(o.push({kind:"combo",t:s.time,combo:s.combo}),i=l)}for(let s of e.breaks)s.endTime-s.startTime>Bh&&(o.push({kind:"breakStart",t:s.startTime}),o.push({kind:"breakEndPrep",t:s.endTime-Bo}));o.sort((s,l)=>{if(s.t!==l.t)return s.t-l.t;let u=c=>c==="combo"?0:c==="breakStart"?1:2;return u(s.kind)-u(l.kind)});let a=r;for(let s of o)if(s.kind==="combo"){let l=r*wl(s.combo);l!==a&&(a=l,Ho(n,r,s.t,l))}else s.kind==="breakStart"?Ho(n,r,s.t,r*_h):Ho(n,r,s.t,a);return n}var or=class{constructor(t,n,r){this.scale=r;A(this,"sizeSegments");A(this,"initialSize",xl*Ml);this.sizeSegments=Fh(t,n)}draw(t,n,r,o){let a=Tl(this.sizeSegments,n,this.initialSize)*this.scale;if(a<=0)return;let s=a*vl;Kn(t,r,o,s,1/vl,0,0,Rh,Ph)}};var Nh=512,Uo=64,Wh=106.75,Hl=.8,jh=1280,Uh=-100,$h=340,Bl=$h-Uh,me=1.4,Vh=Nh*me,Xh=(jh-Vh)/2,ar=628,zh=384,Gh=350,Yh=Gh/2*(Bl/zh);function ir(e){return Xh+e*me}function Kh(e){return ar-e*Bl*me}function qh(e,t,n,r){return e>5?n+(r-n)*(e-5)/5:e<5?n+(n-t)*(e-5)/5:n}function Jh(e){return qh(e,1800,1200,450)}function Zh(e){return e>=.6?1:e<=.44?0:(e-.44)/.16}function Qh(e){return Wh*Math.abs(On(e)*2)*Hl}function Ie(e,t){let n=Math.imul(Math.trunc(e)|0,2654435761)+Math.imul(t|0,40503)>>>0;return n^=n>>>15,n=Math.imul(n,2246822519)>>>0,n^=n>>>13,n=Math.imul(n,3266489917)>>>0,n^=n>>>16,(n>>>0)/4294967296}var eb=["#e879a0","#68b3f0","#f7e04a","#90e070","#f08040"],tb=["rgb(255,240,0)","rgb(255,192,0)","rgb(214,221,28)"],Cl="rgb(255,0,0)";function sr(e,t){let n=e.skin.config.comboColors.length>0?e.skin.config.comboColors:eb;return n[(t+1)%n.length]}var cr=1.1,No=16*cr,kl=No*.925,nb=8*cr,Il=.15,El=.15/.925,lr=6*cr,rb=12*cr,ob=[{topSmall:[0,-.33],largeAngles:[60,180,300],largeSize:No,largeDist:Il},{topSmall:[0,-.25],largeAngles:[0,120,240],largeSize:No,largeDist:Il},{topSmall:[0,-.3],largeAngles:[45,135,225,315],largeSize:kl,largeDist:El},{topSmall:[0,-.34],largeAngles:[0,90,180,270],largeSize:kl,largeDist:El}];function ib(e,t){let n=e*Math.PI/180;return[t*Math.sin(n),t*Math.cos(n)]}function Al(e,t,n,r,o){e.save();let i=e.globalAlpha;e.globalCompositeOperation="lighter",e.globalAlpha=.45*i,e.fillStyle=o,e.beginPath(),e.arc(t,n,r*1.35,0,Math.PI*2),e.fill(),e.globalAlpha=.9*i,e.fillStyle="#ffffff",e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.fill(),e.restore()}function ab(e,t,n,r,o,i,a){let s=r.scale*me,l=Uo*s,u=ob[r.indexInBeatmap%4],c=(Ie(r.startTime,1)-.5)*40*Math.PI/180;e.save();let d=e.globalAlpha;e.translate(t,n),e.rotate(c);let m=u.largeSize*.5*s;for(let h of u.largeAngles){let[p,b]=ib(h,u.largeDist);Al(e,p*l*2,b*l*2,m,o)}Al(e,u.topSmall[0]*l*2,u.topSmall[1]*l*2,nb*.5*s,o);let f=Math.max(0,Math.min(1,i*a/500));f>0&&(e.globalAlpha=f*d,e.strokeStyle="#ffffff",e.lineWidth=lr*s,e.beginPath(),e.arc(0,0,l-lr*s/2,0,Math.PI*2),e.stroke(),e.globalAlpha=d),r.hyperDash&&Fl(e,l,rb*s),e.restore()}function Fl(e,t,n){e.save();let r=e.globalAlpha;e.globalCompositeOperation="lighter",e.globalAlpha=.3*r,e.fillStyle=Cl,e.beginPath(),e.arc(0,0,t,0,Math.PI*2),e.fill(),e.restore(),e.strokeStyle=Cl,e.lineWidth=n,e.beginPath(),e.arc(0,0,t-n/2,0,Math.PI*2),e.stroke()}function sb(e,t,n,r,o){let i=r.type==="tinyDroplet"?.5:1,a=Uo/4*r.scale*i*me;e.save();let s=e.globalAlpha;e.globalCompositeOperation="lighter",e.globalAlpha=.9*s,e.fillStyle=o,e.beginPath(),e.arc(t,n,a,0,Math.PI*2),e.fill(),e.restore(),r.hyperDash&&r.type==="droplet"&&(e.save(),e.translate(t,n),Fl(e,a,6*r.scale*me),e.restore())}function lb(e,t,n,r,o){let i=r.startTime,a=tb[Math.floor(Ie(i,0)*3)%3],s=Math.max(0,Math.min(1,1-o)),l=.6+1.6*Ie(i,3),u=l+(.6-l)*s,c=180*(Ie(i,1)*2-1),d=180*(Ie(i,2)*2-1),m=(c+(d-c)*s)*Math.PI/180,f=Uo*r.scale*u*me;e.save();let h=e.globalAlpha;e.translate(t,n),e.rotate(m),e.globalCompositeOperation="lighter",e.globalAlpha=.9*h,e.fillStyle=a,e.beginPath(),e.arc(0,0,f*.55,0,Math.PI*2),e.fill(),e.globalCompositeOperation="source-over",e.globalAlpha=h,e.strokeStyle="#ffffff",e.lineWidth=lr*r.scale*u*me,e.beginPath(),e.arc(0,0,f-lr*r.scale*u*me/2,0,Math.PI*2),e.stroke(),e.restore()}function st(e,t){let n=e.images.get(`${t}@2x.png`);if(n!==void 0)return{bitmap:n,logW:n.width/2,logH:n.height/2};let r=e.images.get(`${t}.png`);if(r!==void 0)return{bitmap:r,logW:r.width,logH:r.height}}var Rl=["fruit-pear","fruit-grapes","fruit-apple","fruit-orange"],cb="#ff0000",ub=["#fff000","#ffc000","#d6dd1c"];function $o(e,t,n,r,o,i){let a=t.logW*r,s=t.logH*r,l=e.globalAlpha;if(i){e.save(),e.globalCompositeOperation="lighter",e.globalAlpha=.7*l;let u=a*1.2,c=s*1.2;e.drawImage(jo(t.bitmap,cb),-u/2,-c/2,u,c),e.restore()}if(e.drawImage(jo(t.bitmap,o),-a/2,-s/2,a,s),n!==void 0){let u=n.logW*r,c=n.logH*r;e.drawImage(n.bitmap,-u/2,-c/2,u,c)}}function db(e,t,n,r,o){let i=st(t.skin,Rl[o.indexInBeatmap%4]);if(i===void 0)return!1;let a=st(t.skin,`${Rl[o.indexInBeatmap%4]}-overlay`),s=(Ie(o.startTime,1)-.5)*40*Math.PI/180;return e.save(),e.translate(n,r),e.rotate(s),$o(e,i,a,o.scale*me,sr(t,o.indexInBeatmap),o.hyperDash),e.restore(),!0}function mb(e,t,n,r,o,i,a){let s=st(t.skin,"fruit-drop");if(s===void 0)return!1;let l=st(t.skin,"fruit-drop-overlay"),u=o.type==="tinyDroplet"?.5:1,c=Ie(o.startTime,1)*20,d=a*(1-i)/(a+2e3),m=(c+720*d)*Math.PI/180;return e.save(),e.translate(n,r),e.rotate(m),$o(e,s,l,o.scale*me*.8*u,sr(t,o.indexInBeatmap),o.hyperDash&&o.type==="droplet"),e.restore(),!0}function fb(e,t,n,r,o,i){let a=st(t.skin,"fruit-bananas");if(a===void 0)return!1;let s=st(t.skin,"fruit-bananas-overlay"),l=o.startTime,u=ub[Math.floor(Ie(l,0)*3)%3],c=Math.max(0,Math.min(1,1-i)),d=.6+1.6*Ie(l,3),m=d+(.6-d)*c,f=180*(Ie(l,1)*2-1),h=180*(Ie(l,2)*2-1),p=(f+(h-f)*c)*Math.PI/180;return e.save(),e.translate(n,r),e.rotate(p),$o(e,a,s,o.scale*me*m,u,!1),e.restore(),!0}function pb(e){return Qh(e)/Hl}var hb=16,bb=1,gb=0;function yb(e){let t=e.trim().toLowerCase();if(t==="")return 1;if(t==="latest")return 1/0;let n=parseFloat(t);return Number.isFinite(n)?n:1}function Sb(e){return yb(e.config.version)<2.3&&Wo(e,"fruit-ryuuta")!==void 0}var Fo=180;function Pl(e){let n=1-(e<0?0:e>1?1:e);return 1-n*n*n*n*n}function Wo(e,t){return e.images.get(`${t}@2x.png`)??e.images.get(`${t}.png`)}var _l=new WeakMap;function jo(e,t){let n=_l.get(e);n===void 0&&(n=new Map,_l.set(e,n));let r=n.get(t);if(r!==void 0)return r;let o=new OffscreenCanvas(e.width,e.height),i=o.getContext("2d");return i===null?e:(i.drawImage(e,0,0),i.globalCompositeOperation="multiply",i.fillStyle=t,i.fillRect(0,0,o.width,o.height),i.globalCompositeOperation="destination-in",i.drawImage(e,0,0),n.set(t,o),o)}function vb(e){return jo(e,"#ff0000")}var Ll=new WeakMap;function wb(e,t){let n=!1;for(let r of e.beatmap.timingPoints){if(r.time>t)break;n=r.kiai}return n}function xb(e){let t=Ll.get(e);if(t!==void 0)return t;let n=Nl(e),r=e.hitResults,o=[];for(let s=0;s<n.length;s++){let l=n[s],u=(r[s]?.judgement??0)>0;(l.type==="fruit"||l.type==="droplet")&&o.push({time:l.startTime,state:u?wb(e,l.startTime)?"kiai":"idle":"fail"})}let i=[],a=-1;for(let s=0;s<n.length;s++){let l=n[s];if(!(l.type!=="fruit"&&l.type!=="droplet")){if(a>=0){let u=n[a];u.hyperDash&&(r[a]?.judgement??0)>0&&i.push({start:u.startTime,end:l.startTime})}a=s}}return t={stateChanges:o,hypers:i},Ll.set(e,t),t}function Mb(e,t){let n=e.stateChanges,r=0,o=n.length-1,i=-1;for(;r<=o;){let a=r+o>>1;n[a].time<=t?(i=a,r=a+1):o=a-1}return i<0?"idle":n[i].state}function Tb(e,t){let n=e.hypers,r=0,o=n.length-1,i=-1;for(;r<=o;){let s=r+o>>1;n[s].start<=t?(i=s,r=s+1):o=s-1}let a=0;for(let s=i;s>=0;s--){let l=n[s];if(l.end+Fo<t)break;t<=l.end?a=Math.max(a,Pl((t-l.start)/Fo)):a=Math.max(a,1-Pl((t-l.end)/Fo))}return a}function Cb(e,t){let n=Ge(e,t);for(let r of[24,60,140,320]){let o=n-Ge(e,t-r);if(o>2)return 1;if(o<-2)return-1}return 1}function kb(e,t,n,r,o,i,a){let s=o,l=o*(t.height/t.width);e.save(),e.translate(n,r),e.scale(i,1),e.drawImage(t,-s/2,0,s,l),a>.02&&(e.globalAlpha*=a,e.drawImage(vb(t),-s/2,0,s,l)),e.restore()}var Ol=new WeakMap;function Nl(e){let t=Ol.get(e);return t===void 0&&(t=[...e.objects].sort((n,r)=>n.startTime-r.startTime),Ol.set(e,t)),t}function Ib(e,t){let n=0,r=e.length-1,o=-1;for(;n<=r;){let i=n+r>>1;e[i].startTime<=t?(o=i,n=i+1):r=i-1}return o}function Eb(e,t){let n=0,r=e.length-1,o=e.length;for(;n<=r;){let i=n+r>>1;e[i].startTime>=t?(o=i,r=i-1):n=i+1}return o}var Dl=new WeakMap;function Ab(e){let t=Dl.get(e);return t===void 0&&(t=new or(e.beatmap,e.comboFrames,me),Dl.set(e,t)),t}function Rb(e,t,n){let r=t.modDiff.cs,o=t.catcherPath,i=xb(t),a=Ge(o,n),s=pb(r)*me*bb,l=Sb(t.skin),u=l?"fruit-ryuuta":"fruit-catcher-idle",c=st(t.skin,u),d=Wo(t.skin,u),m=Mb(i,n),f=l?d:Wo(t.skin,`fruit-catcher-${m}`)??d;if(f===void 0||d===void 0||c===void 0)return;let h=s*(c.logH/c.logW),p=ar-h*(hb/c.logH)+gb;kb(e,f,ir(a),p,s,Cb(o,n),Tb(i,n))}function Wl(e,t,n,r){let{modDiff:o}=t,i=Jh(o.ar),a=Nl(t),s=Eb(a,n),l=Ib(a,n+i);for(let c=l;c>=s;c--){let d=a[c],m=(d.startTime-n)/i;if(m<0||m>1)continue;let f=r.modHidden?Zh(m):1;if(f<=0)continue;e.globalAlpha=f;let h=Kh(m),p=ir(d.effectiveX);d.type==="banana"?fb(e,t,p,h,d,m)||lb(e,p,h,d,m):d.type==="fruit"?db(e,t,p,h,d)||ab(e,p,h,d,sr(t,d.indexInBeatmap),m,i):mb(e,t,p,h,d,m,i)||sb(e,p,h,d,sr(t,d.indexInBeatmap)),e.globalAlpha=1}if(Rb(e,t,n),r.modFlashlight){let c=Ge(t.catcherPath,n);Ab(t).draw(e,n,ir(c),ar)}let u=Ge(t.catcherPath,n);us(e,t.comboFrames,n,ir(u),ar-Yh*me,t.skin)}var jl={build(e,t,n,r,o){let i=zt(e,n);Gt(i,e,n);let a=yl(t),s=Sl(i,a,n.cs),l=Xe(s);return{beatmap:e,replay:t,modDiff:n,skin:r,objects:i,catcherPath:a,hitResults:s,comboFrames:l}},draw(e,t,n,r){Wl(e,t,n,r)},hitResults:e=>e.hitResults,comboFrames:e=>e.comboFrames};var Ul=1280,$l=720,Pb=3,ln=class{constructor(t,n,r,o,i){this.replay=n;A(this,"ctx");A(this,"ruleset");A(this,"session");A(this,"hitResults");A(this,"comboFrames");A(this,"oldOffsetMs");A(this,"options",{showFollowpoints:!0,audioOffsetMs:0,maniaScrollSpeed:20,maniaUpscroll:!1,modHidden:!1,modFlashlight:!1,modFadeIn:!1,modCover:!1});let a=t.getContext("2d",{alpha:!1});if(a===null)throw new Error("Failed to get 2D canvas context");this.ctx=a,this.options.modHidden=i.isHD,this.options.modFlashlight=i.isFL,this.options.modFadeIn=i.isFadeIn,this.options.modCover=i.isCover;let l=Math.max(1,Math.min((typeof devicePixelRatio=="number"?devicePixelRatio:1)||1,Pb));t.width=Ul*l,t.height=$l*l,a.scale(l,l),a.imageSmoothingEnabled=!0,a.imageSmoothingQuality="high";let u=n.mode===3?gl:n.mode===1?Qs:n.mode===2?jl:gs;this.ruleset=u,this.session=u.build(r,n,i,o,l),this.hitResults=u.hitResults(this.session),this.comboFrames=u.comboFrames(this.session),n.mode===3&&(this.options.maniaUpscroll=this.session.defaultUpscroll),this.oldOffsetMs=r.formatVersion<5?24:0}get maniaSamples(){return this.replay.mode===3?this.session.samplesBySource:null}get taikoGhostTaps(){return this.replay.mode===1?this.session.ghostTaps:null}renderFrameAt(t){let{ctx:n,options:r}=this;n.fillStyle="#1a1a2e",n.fillRect(0,0,Ul,$l),r.backdropOverlay?.(n,t),this.ruleset.draw(n,this.session,t,r),r.hudOverlay?.(n,t)}};function Vl(e,t){let n=0;for(let r=1;r<e.length&&!(e[r].startTime>t);r++)n=r;return n}var cn=class{constructor(){A(this,"startOffset",0);A(this,"segments",[])}get offset(){return this.startOffset}setOffset(t){this.startOffset=t,this.segments=[]}clear(){this.segments=[]}set(t,n,r){this.startOffset=n,this.segments=[{startTime:t,startOffset:n,playbackSpeed:r}]}positionAt(t){if(this.segments.length===0)return this.startOffset;let n=this.segments[Vl(this.segments,t)],r=Math.max(0,t-n.startTime);return n.startOffset+r*n.playbackSpeed}schedulingSpeed(t){return this.segments.length===0?t:this.segments[this.segments.length-1].playbackSpeed}prune(t){let n=Vl(this.segments,t);n>0&&(this.segments=this.segments.slice(n))}appendSegment(t,n){let r=this.segments[0];if(!r){this.set(t,this.offset,n);return}if(t<=r.startTime){this.startOffset=r.startOffset,this.segments=[{...r,playbackSpeed:n}];return}let o=this.positionAt(t);this.segments.push({startTime:t,startOffset:o,playbackSpeed:n})}};function Xl(e){return e!==void 0&&Number.isFinite(e)&&e>0?e:null}function _b(e,t){return Math.max(0,Math.min(e,t))}function Lb(e){try{let t=e.getOutputTimestamp(),{contextTime:n,performanceTime:r}=t;return n===void 0||r===void 0||!Number.isFinite(n)||!Number.isFinite(r)?null:n+(performance.now()-r)/1e3}catch{return null}}function Ob(e){return Xl(e.outputLatency)??Xl(e.baseLatency)??0}function Vo(e){let t=e.currentTime,n=t-Ob(e),r=Lb(e),o=r===null?n:Math.min(r,n);return _b(o,t)}async function un({items:e,concurrency:t,load:n,onItem:r,signal:o,failureMode:i="collect"}){let a=[...e],s=[],l=0,u=Math.min(a.length,Math.max(1,Math.floor(t))),c=async()=>{for(;!o?.aborted&&!(i==="throw"&&s.length>0);){let d=l++,m=a[d];if(m===void 0)return;try{let f=await n(m);o?.aborted||r?.(f,m)}catch(f){o?.aborted||s.push({item:m,error:f})}}};if(await Promise.all(Array.from({length:u},c)),i==="throw"){if(o?.aborted)throw o.reason??new Error("\u64CD\u4F5C\u5DF2\u53D6\u6D88");if(s.length)throw s[0].error}return s}var zl=`
body.preview-controls {
  --control-bg:#121212; --control-panel:#1b1b1b; --control-raised:#272727;
  --control-text:#f1f1f1; --control-muted:#a6a6a6; --control-line:#383838;
  --control-accent:var(--preview-accent,#5b8cff); --control-on-accent:var(--preview-on-accent,#000);
  --control-accent-text:var(--preview-accent-text,#8eadff); background:var(--control-bg);
}
html[data-theme="light"] body.preview-controls {
  --control-bg:#f5f5f5; --control-panel:#fff; --control-raised:#ededed;
  --control-text:#202020; --control-muted:#666; --control-line:#d5d5d5;
  --control-accent-text:var(--preview-accent-text,#245cdb);
}
.preview-controls :is(#controls,#header,#info-bar,#fs-overlay) {
  --text:var(--control-text); --muted:var(--control-muted); --border:var(--control-line);
  --accent:var(--control-accent); --playhead:var(--control-text); --playhead-glow:none;
  color:var(--control-text);
}
.preview-controls:not(.fullscreen) #app { overflow:hidden; }
.preview-controls:not(.fullscreen) #header { align-items:center; padding:2px 2px 4px; border:0; }
.preview-controls #title { font-size:15px; font-weight:650; }
.preview-controls :is(#status,#mode-notice,#media-notice) { color:var(--control-muted); }
.preview-controls:not(.fullscreen) #controls {
  padding:12px; gap:10px; border:1px solid var(--control-line); border-top:3px solid var(--control-accent);
  border-radius:16px; background:var(--control-panel); isolation:isolate;
}
.preview-controls #controls :is(button,[tabindex]):focus-visible { outline:2px solid var(--control-accent-text); outline-offset:3px; }
.preview-controls #controls button { font-family:inherit; -webkit-tap-highlight-color:transparent; cursor:pointer; }
.preview-controls #controls button:disabled { cursor:not-allowed; }
.preview-controls:not(.fullscreen) .preview-time-row { justify-content:space-between!important; }
.preview-time-heading { display:flex; align-items:baseline; gap:12px; min-width:0; }
.preview-position-label { color:var(--control-muted); font-size:11px; letter-spacing:.12em; white-space:nowrap; }
.preview-controls:not(.fullscreen) #time-label { font-family:inherit; font-size:13px; line-height:20px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; color:var(--control-text); }
.preview-measure { display:flex; align-items:baseline; gap:4px; font-size:10px; color:var(--control-muted); white-space:nowrap; }
.preview-controls .preview-measure #timeline-badge { position:static; transform:none; background:transparent; padding:0; font-family:inherit; font-size:13px; line-height:20px; font-weight:600; color:var(--control-text); }
.preview-controls:not(.fullscreen) .preview-timeline-row { margin:-4px 0 2px; }
.preview-controls:not(.fullscreen) .preview-transport { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:7px; align-items:stretch; }
.preview-controls:not(.fullscreen) .transport-side { display:contents; }
.preview-controls:not(.fullscreen) #controls .transport-btn {
  width:100%; height:62px; min-width:0; padding:0; flex-direction:column; gap:5px;
  background:var(--control-raised); border:1px solid transparent; border-radius:10px; color:var(--control-text);
}
.preview-controls:not(.fullscreen) .transport-btn::after { content:attr(data-control-label); font-size:11px; font-weight:500; white-space:nowrap; }
.preview-controls:not(.fullscreen) #controls .transport-btn:hover { border-color:var(--control-line); }
.preview-controls:not(.fullscreen) #controls #btn-step-back { grid-column:1/3; grid-row:1; }
.preview-controls:not(.fullscreen) #controls :is(#play,#play-button) {
  grid-column:3/5; grid-row:1; width:100%; height:62px; min-width:0; border-radius:10px;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;
  background:var(--control-accent); color:var(--control-on-accent); box-shadow:none;
}
.preview-controls:not(.fullscreen) :is(#play,#play-button)::after { content:attr(aria-label); font-size:11px; font-weight:500; }
.preview-controls:not(.fullscreen) #controls #btn-step-forward { grid-column:5/7; grid-row:1; }
.preview-controls:not(.fullscreen) #controls #btn-restart { grid-column:1/4; grid-row:2; height:48px; flex-direction:row; }
.preview-controls:not(.fullscreen) #controls #btn-fullscreen { grid-column:4/7; grid-row:2; height:48px; flex-direction:row; }
.preview-controls:not(.fullscreen) .preview-transport.has-measures { grid-template-columns:repeat(12,minmax(0,1fr)); gap:7px 5px; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-step-back { grid-column:1/5; }
.preview-controls:not(.fullscreen) #controls .has-measures #play { grid-column:5/9; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-step-forward { grid-column:9/13; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-restart { grid-column:1/4; height:62px; flex-direction:column; }
.preview-controls:not(.fullscreen) #controls #btn-prev-measure { grid-column:4/7; grid-row:2; }
.preview-controls:not(.fullscreen) #controls #btn-next-measure { grid-column:7/10; grid-row:2; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-fullscreen { grid-column:10/13; height:62px; flex-direction:column; }
.preview-controls:not(.fullscreen) #controls .loop-row { justify-content:space-between; padding-top:9px; border-top:1px solid var(--control-line); }
.preview-controls:not(.fullscreen) #controls .loop-btn { width:44%; min-height:44px; padding:0 12px; border-radius:10px; font-size:13px; background:var(--control-bg); border-color:var(--control-line); color:var(--control-muted); }
.preview-controls:not(.fullscreen) #controls .loop-btn.on { background:var(--control-raised); color:var(--control-accent-text); border-color:var(--control-accent-text); }
.preview-settings { margin-top:4px; padding-top:14px; border-top:1px solid var(--control-line); min-width:0; }
.preview-settings h2 { margin:0 0 16px; font-size:14px; line-height:20px; font-weight:650; }
.preview-section { margin:0 0 15px; }
.preview-section:last-child { margin:0; }
.preview-section h3 { margin:0 0 8px; color:var(--control-muted); font-size:11px; line-height:18px; font-weight:550; }
.preview-controls #controls .preview-section>.row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; padding:0; border:0; }
.preview-controls #controls .preview-settings .field { display:block; min-width:0; height:62px; padding:0; border:0; }
.preview-controls #controls .parameter-control {
  display:block; width:100%; min-width:0; height:62px; padding:9px 10px 7px; overflow:hidden;
  border:1px solid var(--control-line); border-radius:11px; background:var(--control-bg); color:var(--control-text);
  cursor:ew-resize; touch-action:pan-y; user-select:none; -webkit-user-select:none; text-align:left;
}
.preview-controls #controls .parameter-control:is(:hover,:focus-visible,.is-dragging) { background:var(--control-raised); border-color:var(--control-accent-text); }
.parameter-head { display:flex; height:21px; align-items:center; justify-content:space-between; gap:6px; }
.parameter-label { font-size:11px; font-weight:500; color:var(--control-muted); }
.parameter-value { font-size:14px; font-weight:650; font-variant-numeric:tabular-nums; white-space:nowrap; }
.parameter-rail { display:block; position:relative; height:18px; margin-top:3px; }
.parameter-ticks { position:absolute; inset:5px 0 2px; background:repeating-linear-gradient(to right,var(--control-line) 0 1px,transparent 1px calc(100% / 16)); border-right:1px solid var(--control-line); }
.parameter-cursor { position:absolute; top:2px; bottom:0; left:clamp(1px,var(--parameter-position,0%),calc(100% - 1px)); width:2px; background:var(--control-accent-text); transform:translateX(-50%); }
.parameter-cursor::before { content:''; position:absolute; width:4px; height:4px; top:-1px; left:-1px; border-radius:1px; background:inherit; }
.parameter-options { display:flex; gap:3px; height:20px; }
.parameter-options span { flex:1; min-width:0; text-align:center; font-size:9px; line-height:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--control-muted); border-bottom:2px solid var(--control-line); border-radius:4px; }
.parameter-options .selected { color:var(--control-accent-text); border-color:var(--control-accent-text); background:var(--control-raised); }
.parameter-control[data-enum="true"] .parameter-value { font-size:12px; }
.preview-controls #controls .preview-settings .toggle { width:100%; min-width:0; height:62px; padding:10px; border-radius:11px; background:var(--control-bg); border:1px solid var(--control-line); color:var(--control-muted); font-size:11px; font-weight:500; text-align:left; display:flex; align-items:center; gap:7px; white-space:normal; }
.preview-settings .toggle::before { content:''; width:8px; height:8px; flex:none; border:1px solid currentColor; border-radius:50%; }
.preview-controls #controls .preview-settings .toggle[aria-pressed="true"] { background:var(--control-raised); border-color:var(--control-accent-text); color:var(--control-text); }
.preview-settings .toggle[aria-pressed="true"]::before { background:var(--control-accent); border-color:var(--control-accent-text); }
.preview-controls [hidden] { display:none!important; }
.preview-controls:not(.fullscreen) .preview-details { display:flex; flex-wrap:nowrap; align-items:center; gap:12px; height:28px; min-width:0; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; color:var(--control-muted); font-size:10px; line-height:20px; }
.preview-controls:not(.fullscreen) .preview-details :is(#info-bar,.info-row) { display:contents; }
.preview-controls:not(.fullscreen) .preview-details .info-item { flex:none; white-space:nowrap; overflow:visible; font-size:10px; }
.preview-details .info-val { color:var(--control-text); font-variant-numeric:tabular-nums; }
.preview-controls:not(.fullscreen) #header { display:flex; justify-content:flex-start; align-items:center; gap:8px; flex:none; min-height:28px; }
.preview-controls:not(.fullscreen) #title { flex:0 1 12em; width:12em; min-width:0; height:24px; line-height:24px; white-space:nowrap; overflow:hidden; text-overflow:clip; }
.preview-controls #title>span { display:inline-block; width:max-content; }
.preview-controls #title.is-scrolling>span { animation:preview-title-scroll var(--title-duration) linear 1s infinite alternate; }
@keyframes preview-title-scroll { from { transform:translateX(0); } to { transform:translateX(var(--title-offset)); } }
.preview-heading-badges { display:flex; flex:none; align-items:center; }
.preview-difficulty { display:flex; white-space:nowrap; border:1px solid; border-radius:999px; padding:3px 9px; font-size:11px; font-weight:700; }
.preview-difficulty-value { font-variant-numeric:tabular-nums; }
.preview-controls:not(.fullscreen) #status { flex:1; min-width:0; width:auto; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px; line-height:16px; }
.preview-scroll { flex:1; min-height:0; overflow-y:auto; overscroll-behavior-y:contain; scrollbar-width:thin; }
.preview-controls:not(.fullscreen) :is(#stage-wrap,#canvas-wrap) { flex:none; height:var(--preview-stage-height)!important; min-height:0; width:100%; }
.preview-controls:not(.fullscreen) #stage-wrap .stage { width:min(100%,var(--preview-stage-width)); height:100%; aspect-ratio:auto; }
body.fullscreen .preview-scroll { display:contents; }
body.fullscreen :is(.preview-settings,.preview-time-heading,.preview-details) { display:none!important; }
.preview-controls .heat-timeline { position:relative; height:44px!important; min-height:44px; width:100%; touch-action:none; }
.preview-controls .heat-timeline[data-tracks="2"] { height:106px!important; min-height:106px; }
.preview-controls .heat-timeline :is(#timeline-bars,#fs-timeline-bars) { position:absolute; inset:4px 0 auto; height:auto; overflow:visible; pointer-events:none; }
.heat-track { position:relative; height:18px; }
.heat-timeline[data-tracks="2"] .heat-track { height:46px; padding-top:15px; }
.heat-track-label { position:absolute; top:0; left:0; color:var(--control-muted); font-size:9px; line-height:12px; font-weight:650; }
.heat-strip { position:relative; height:18px; border-bottom:1px solid var(--control-line); }
.heat-layer { position:absolute; inset:0; color:var(--control-muted); }
.heat-layer.played { color:var(--control-accent); clip-path:inset(0 calc(100% - var(--heat-progress,0%)) 0 0); }
.heat-bin { position:absolute; top:0; height:14px; background:currentColor; }
.heat-cursor { position:absolute; left:var(--heat-progress,0%); top:-2px; height:25px; width:2px; transform:translateX(-1px); border-radius:1px; background:var(--control-text); box-shadow:0 0 0 1px var(--control-panel); z-index:5; }
.heat-cursor::before { content:''; position:absolute; top:-2px; left:-2px; width:6px; height:6px; border-radius:2px; background:inherit; box-shadow:0 0 0 2px var(--control-panel); }
.preview-controls .heat-timeline :is(#timeline-ruler,#fs-timeline-ruler) { position:absolute; inset:auto 0 0; height:12px; pointer-events:none; font-size:9px; line-height:12px; font-variant-numeric:tabular-nums; color:var(--control-muted); }
.heat-label { position:absolute; transform:translateX(-50%); white-space:nowrap; }
.heat-label:first-child { transform:none; }
.heat-loop-marker { position:absolute; top:13px; transform:translateX(-50%); width:14px; height:14px; font-size:8px; line-height:12px; text-align:center; background:var(--control-panel); color:var(--control-text); border:1px solid var(--control-text); border-radius:3px; z-index:6; }
.heat-loop-range { position:absolute; top:-2px; height:20px; background:var(--control-raised); border-top:1px solid var(--control-muted); opacity:.55; }
.preview-controls .heat-timeline :is(#timeline-playhead,#fs-timeline-playhead,#timeline-badge,#fs-timeline-badge) { display:none; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) {
  position:fixed; inset:auto max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));
  width:auto; max-width:760px; margin:0 auto; padding:10px 12px; gap:6px; border:1px solid var(--control-line);
  border-top:3px solid var(--control-accent); border-radius:14px; background:var(--control-panel); box-shadow:none; color:var(--control-text);
}
body.preview-controls.fullscreen #controls { display:grid; }
body.preview-controls.fullscreen:has(#fs-overlay) #controls { display:none; }
body.preview-controls.fullscreen #fs-overlay { display:flex; flex-direction:column; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay).hidden { opacity:0; pointer-events:none; transform:translateY(120%); }
body.preview-controls.fullscreen .transport-group { display:flex; gap:6px; width:100%; align-items:stretch; }
body.preview-controls.fullscreen .transport-side { display:contents; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) .transport-btn {
  flex:1; width:auto; min-width:0; height:44px; padding:4px; border-radius:9px; border:1px solid var(--control-line);
  background:var(--control-raised); color:var(--control-text); display:flex; flex-direction:column; justify-content:center; align-items:center; gap:2px;
}
body.preview-controls.fullscreen .transport-btn::after { content:attr(aria-label); font-size:10px; line-height:12px; white-space:nowrap; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) :is(#play,#play-button,#fs-play) { flex:1.3; height:44px; width:auto; border-radius:9px; background:var(--control-accent); color:var(--control-on-accent); box-shadow:none; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
body.preview-controls.fullscreen :is(#play,#play-button)::after { content:attr(aria-label); font-size:10px; line-height:12px; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) .transport-btn svg { width:18px; height:18px; }
.preview-controls :is(#controls,#fs-overlay) .loop-row { display:flex; justify-content:space-between; gap:4px; width:100%; color:var(--control-muted); }
.preview-controls :is(#controls,#fs-overlay) .loop-btn { flex:none; width:44%; min-width:36px; min-height:36px; padding:3px 14px; font-family:monospace; font-size:13px; font-weight:700; border:1px solid var(--control-line); border-radius:10px; background:var(--control-bg); color:var(--control-muted); font-variant-numeric:tabular-nums; cursor:pointer; }
.preview-controls :is(#controls,#fs-overlay) .loop-btn.on { border-color:var(--control-accent-text); color:var(--control-accent-text); background:var(--control-raised); }
.preview-controls .loop-sep { display:inline; margin:0 2px; }
body.preview-controls.fullscreen #fs-lock { top:auto; right:max(12px,env(safe-area-inset-right),calc((100vw - 760px) / 2)); bottom:calc(max(10px,env(safe-area-inset-bottom)) + var(--preview-fullscreen-controls-height,0px) + 16px); left:auto; transform:none; width:48px; height:48px; border-radius:9px; border:1px solid var(--control-line); background:var(--control-panel); color:var(--control-text); flex-direction:column; gap:3px; box-shadow:none; }
body.preview-controls.fullscreen #fs-lock::after { content:attr(aria-label); font-size:10px; line-height:12px; }
body.preview-controls.fullscreen #fs-lock.locked { color:var(--control-on-accent); background:var(--control-accent); border-color:var(--control-accent); }
body.preview-controls.fullscreen :is(#time-label,#fs-time-label) { font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; }
@media(max-width:375px) { .preview-controls:not(.fullscreen) #controls { padding:10px; } .parameter-label { font-size:10px; } .parameter-value { font-size:13px; } }
@media(prefers-reduced-motion:reduce) { .preview-controls #controls * { transition:none!important; } }
`;function Gl(e){let t=document.querySelector(".preview-scroll");e&&t&&(t.dataset.windowScroll=String(t.scrollTop)),document.body.classList.toggle("fullscreen",e),!e&&t&&(t.scrollTop=Number(t.dataset.windowScroll??0))}function Yl(e){let t=document.getElementById("controls"),n=new Ve(()=>!1),r=document.createElement("style");r.textContent=zl,document.head.append(r),document.body.classList.add("preview-controls");let o=Array.from(t.children),i=document.getElementById("time-label").closest(".row"),a=document.getElementById("timeline-host").closest(".row"),s=t.querySelector(".transport-group"),l=t.querySelector(".loop-row");if(!l){l=document.createElement("div"),l.className="row loop-row";for(let T of["a","b"]){let C=document.createElement("button");C.id=`btn-loop-${T}`,C.type="button",C.className="loop-btn",C.textContent=`${T.toUpperCase()} \u2014`,l.append(C)}let w=document.createElement("span");w.className="loop-sep",w.textContent="\u21CC",l.firstElementChild.after(w)}i.classList.add("preview-time-row"),a.classList.add("preview-timeline-row"),s.classList.add("preview-transport"),s.classList.toggle("has-measures",!!e.measureNavigation);let u=document.createElement("div");u.className="preview-time-heading";let c=document.createElement("span");if(c.className="preview-position-label",c.textContent="\u64AD\u653E\u8BE6\u60C5",u.append(c),i.prepend(u),e.measureNavigation){let w=document.createElement("span");w.className="preview-measure",w.textContent="\u5C0F\u8282 ",w.append(document.getElementById("timeline-badge")),u.append(w)}if(t.append(i),e.details?.length){let w=document.createElement("div");w.className="preview-details",w.setAttribute("aria-label","\u8C31\u9762\u5B9E\u65F6\u4FE1\u606F"),w.append(...e.details),t.append(w)}t.append(a,s),l&&t.append(l);let d={"btn-restart":e.measureNavigation?"\u672C\u8282\u91CD\u64AD":"\u91CD\u64AD","btn-prev-measure":"\u4E0A\u4E00\u8282","btn-next-measure":"\u4E0B\u4E00\u8282","btn-step-back":e.measureNavigation?"\u9000\u4E00\u62CD":"\u9000 5 \u79D2","btn-step-forward":e.measureNavigation?"\u8FDB\u4E00\u62CD":"\u8FDB 5 \u79D2","btn-fullscreen":"\u5168\u5C4F"};for(let[w,T]of Object.entries(d)){let C=document.getElementById(w);C&&(C.dataset.controlLabel=T)}let m=document.createElement("section");m.className="preview-settings controls-settings",m.setAttribute("aria-label","\u53C2\u6570\u4E0E\u6548\u679C");let f=document.createElement("h2");f.textContent="\u53C2\u6570\u4E0E\u6548\u679C",m.append(f),o.filter(w=>![i,a,s,l].includes(w)).forEach((w,T)=>{let C=document.createElement("section");C.className="preview-section";let E=document.createElement("h3");E.textContent=e.sections[T]??"\u5176\u4ED6\u8BBE\u7F6E",C.append(E,w),m.append(C)}),t.append(m);for(let w of m.querySelectorAll(".wheel-trigger"))w.dataset.presentation="inline";let h=()=>{for(let w of m.querySelectorAll(".preview-section")){let T=Array.from(w.querySelectorAll(".field,.toggle")),C=T.length>0&&T.every(E=>E.hidden);w.hidden!==C&&(w.hidden=C)}},p=new MutationObserver(h);p.observe(m,{subtree:!0,attributes:!0,attributeFilter:["hidden"]}),n.own(()=>p.disconnect()),h();let b=document.getElementById("app"),S=document.getElementById("header"),g=document.getElementById("stage-wrap")??document.getElementById("canvas-wrap"),v=document.createElement("div");v.className="preview-scroll",t.before(v),v.append(t);let x=document.getElementById("fs-overlay")??t,k=()=>{if(document.body.classList.contains("fullscreen")){document.body.style.setProperty("--preview-fullscreen-controls-height",`${x.offsetHeight}px`);return}let w=document.getElementById("title"),T=w.firstElementChild,C=Math.max(0,(T?.scrollWidth??0)-w.clientWidth);w.style.setProperty("--title-offset",`${-C}px`),w.style.setProperty("--title-duration",`${Math.max(6,C/28+3)}s`),w.classList.toggle("is-scrolling",C>0);let E=Math.max(0,b.clientHeight-S.offsetHeight-32),R=e.stageAspectRatio??16/9,D=Math.min(g.clientWidth/R,E*.55);g.style.setProperty("--preview-stage-height",`${Math.max(1,D)}px`),g.style.setProperty("--preview-stage-width",`${Math.max(1,D*R)}px`)},M=new ResizeObserver(k);M.observe(b),M.observe(S),M.observe(x),n.own(()=>M.disconnect());let y=new MutationObserver(k);return y.observe(document.body,{attributes:!0,attributeFilter:["class"]}),y.observe(document.getElementById("title"),{childList:!0,subtree:!0}),n.own(()=>y.disconnect()),k(),()=>n.dispose()}function Fb(e,t,n){if(!Number.isFinite(e)||e<=0)return t.map(()=>[]);let r=Math.min(200,Math.max(1,Math.ceil(Number.isFinite(n)?n:1))),o=t.map(a=>{let s=new Array(r).fill(0);for(let l of a.times)Number.isFinite(l)&&(s[Math.min(r-1,Math.max(0,Math.floor(l/e*r)))]+=1);return s}),i=Math.max(1,...o.flat());return o.map(a=>a.map(s=>s===0?0:Math.max(2/22,s/i)))}var ur=class{constructor(t){this.elements=t;A(this,"loop",[null,null]);A(this,"markers",[]);t.host.classList.add("heat-timeline"),t.bars.classList.add("heat-bars"),t.ruler.classList.add("heat-ruler"),t.host.setAttribute("role","slider"),t.host.setAttribute("aria-label","\u64AD\u653E\u8FDB\u5EA6"),t.host.setAttribute("aria-valuemin","0"),t.host.setAttribute("aria-valuemax","100"),t.host.tabIndex=0,t.bars.setAttribute("aria-hidden","true"),t.ruler.setAttribute("aria-hidden","true")}build(t,n,r){let{host:o,bars:i,ruler:a}=this.elements,s=Fb(t,n,o.getBoundingClientRect().width);o.dataset.tracks=String(n.length),this.markers=[],i.replaceChildren(),n.forEach((c,d)=>{let m=document.createElement("div");if(m.className="heat-track",c.label){let g=document.createElement("span");g.className="heat-track-label",g.textContent=c.label,m.append(g)}let f=document.createElement("div");f.className="heat-strip";let h=document.createElement("span");h.className="heat-loop-range",f.append(h);for(let g of[!1,!0]){let v=document.createElement("div");v.className=g?"heat-layer played":"heat-layer";let x=s[d];x.forEach((k,M)=>{if(k===0)return;let y=document.createElement("span");y.className="heat-bin",y.style.left=`${M/x.length*100}%`,y.style.width=`${100/x.length}%`,y.style.opacity=String(k),v.append(y)}),f.append(v)}let p=document.createElement("span");p.className="heat-cursor",f.append(p);let[b,S]=["A","B"].map(g=>{let v=document.createElement("span");return v.className="heat-loop-marker",v.textContent=g,f.append(v),v});this.markers.push({a:b,b:S,range:h}),m.append(f),i.append(m)}),a.replaceChildren();let l=Math.max(1,o.getBoundingClientRect().width),u=-1/0;for(let{percent:c,text:d}of r){let m=c*l/100;if(c<0||c>100||m-u<44||c>0&&l-m<20)continue;u=m;let f=document.createElement("span");f.className="heat-label",f.style.left=`${c}%`,f.textContent=d,a.append(f)}this.updateLoop(...this.loop)}updateProgress(t,n){let r=Math.min(100,Math.max(0,Number.isFinite(t)?t:0)),{host:o,playhead:i,badge:a}=this.elements;o.style.setProperty("--heat-progress",`${r}%`),o.setAttribute("aria-valuenow",String(r)),o.setAttribute("aria-valuetext",n),i.style.left=`${r}%`,a.textContent=n}updateLoop(t,n){this.loop=[t,n];for(let r of this.markers){for(let[o,i]of[[r.a,t],[r.b,n]])o.hidden=i===null,i!==null&&(o.style.left=`${i}%`);r.range.hidden=t===null||n===null,t!==null&&n!==null&&(r.range.style.left=`${Math.min(t,n)}%`,r.range.style.width=`${Math.abs(n-t)}%`)}}};function Kl(e,t){return!Number.isFinite(e)||e<=0?[]:Array.from({length:6},(n,r)=>({percent:r*20,text:t(e*r/5)}))}function ql(e,t,n){let r=0,o=e.length;for(;r<o;){let i=r+o>>>1;n(e[i])<=t?r=i+1:o=i}return r}var Jl=[".wav",".mp3",".ogg"],Nb=20;function Wb(e,t,n,r){let o=0;for(let i of t)i.combo===0&&o>Nb&&i.time>=r-10&&e.push({beatmapMs:i.time+n,type:"combobreak",sampleSet:0,sampleIndex:0,customFile:""}),o=i.combo}var jb={1:"normal",2:"soft",3:"drum"},Ub=5;function Zl(e){return e.flatMap(t=>t.source&&t.type!=="combobreak"&&t.type!=="spinnerbonus"?[{...t.source,beatmapMs:t.beatmapMs,sampleIndex:t.sampleIndex,type:t.type}]:[])}function Ql(e){let t=[],{mode:n,beatmap:r,hitResults:o,maniaSamples:i,taikoGhostTaps:a,oldOffsetMs:s,fromBeatmapMs:l,comboFrames:u}=e;return n===1?zb(t,r,o,a,s,l):n===3?Vb(t,r,o,i,s,l):n===2?Xb(t,r,o,s,l):$b(t,r,o,s,l),Wb(t,u,s,l),t.sort((c,d)=>c.beatmapMs-d.beatmapMs),t}function $b(e,t,n,r,o){for(let[i,a]of n.entries()){if(a.isSliderSub||a.comboBreak||a.time<o-10)continue;let s=a.time+r,l=t.hitObjects[a.objectIndex],u=lt(t,a.time),c=l?.type==="slider"?ht(l,0).hitSound:l?.hitSound??a.hitSound,d=l?.hitSample??{normalSet:0,additionSet:0,index:0,volume:0,filename:""},m=l?.type==="slider"?ht(l,0):void 0,f=m?.normalSet||d.normalSet||u.sampleSet||1,h=m?.additionSet||d.additionSet||f,p=d.index||u.sampleIndex||0,b=d.filename,S=Ye(d.volume,u.volume),g={objectId:`std:${a.objectIndex}:hit:${i}`,normalSet:f,additionSet:h};e.push({beatmapMs:s,type:"normal",sampleSet:f,sampleIndex:p,customFile:b,volume:S,source:g}),c&2&&e.push({beatmapMs:s,type:"whistle",sampleSet:h,sampleIndex:p,customFile:b,volume:S,source:g}),c&4&&e.push({beatmapMs:s,type:"finish",sampleSet:h,sampleIndex:p,customFile:b,volume:S,source:g}),c&8&&e.push({beatmapMs:s,type:"clap",sampleSet:h,sampleIndex:p,customFile:b,volume:S,source:g})}for(let[i,a]of t.hitObjects.entries()){if(a.type!=="slider")continue;let s=le(t,a),l=s>0&&Number.isFinite(o)?Math.max(1,Math.floor((o-10-a.time)/s)-1):1;for(let u=l;u<=a.slides;u++){let c=a.time+s*u;if(c<o-10)continue;let d=c+r,m=lt(t,c),f=ht(a,u),h=f.hitSound,p=f.normalSet||a.hitSample.normalSet||m.sampleSet||1,b=f.additionSet||a.hitSample.additionSet||p,S=a.hitSample.index||m.sampleIndex||0,g=a.hitSample.filename,v=Ye(a.hitSample.volume,m.volume),x={objectId:`std:${i}:edge:${u}`,normalSet:p,additionSet:b};e.push({beatmapMs:d,type:"normal",sampleSet:p,sampleIndex:S,customFile:g,volume:v,source:x}),h&2&&e.push({beatmapMs:d,type:"whistle",sampleSet:b,sampleIndex:S,customFile:g,volume:v,source:x}),h&4&&e.push({beatmapMs:d,type:"finish",sampleSet:b,sampleIndex:S,customFile:g,volume:v,source:x}),h&8&&e.push({beatmapMs:d,type:"clap",sampleSet:b,sampleIndex:S,customFile:g,volume:v,source:x})}}for(let i of n){let a=i.spinnerBonusTimes;if(a!==void 0)for(let s of a){if(s<o-10)continue;let l=lt(t,s);e.push({beatmapMs:s+r,type:"spinnerbonus",sampleSet:0,sampleIndex:0,customFile:"",volume:Ye(0,l.volume)})}}}function Vb(e,t,n,r,o,i){for(let[a,s]of n.entries()){if(s.time<i-10||s.subResult==="body"||s.subResult==="tail"||s.judgement===0)continue;let l=s.time+o,u=r?.get(s.objectIndex),c=lt(t,s.time),d=u??{normalSet:0,additionSet:0,index:0,volume:0,filename:""},m=d.normalSet||c.sampleSet||1,f=d.additionSet||m,h=d.index||c.sampleIndex||0,p=d.filename,b=s.hitSound,S=Ye(d.volume,c.volume),g={objectId:`mania:${s.objectIndex}:hit:${a}`,normalSet:m,additionSet:f};(b&14)!==0||e.push({beatmapMs:l,type:"normal",sampleSet:m,sampleIndex:h,customFile:p,volume:S,source:g}),b&2&&e.push({beatmapMs:l,type:"whistle",sampleSet:f,sampleIndex:h,customFile:p,volume:S,source:g}),b&4&&e.push({beatmapMs:l,type:"finish",sampleSet:f,sampleIndex:h,customFile:p,volume:S,source:g}),b&8&&e.push({beatmapMs:l,type:"clap",sampleSet:f,sampleIndex:h,customFile:p,volume:S,source:g})}}function Xb(e,t,n,r,o){for(let[i,a]of n.entries()){if(a.time<o-10||a.judgement===0||a.catchType==="tinyDroplet")continue;let s=a.time+r,l=lt(t,a.time);if(a.catchType==="banana"){let g=Ye(0,l.volume);e.push({beatmapMs:s,type:"normal",sampleSet:0,sampleIndex:0,customFile:"catch-banana",volume:g,source:{objectId:`catch:${a.objectIndex}:banana:${i}`,normalSet:0,additionSet:0}});continue}let c=t.hitObjects[a.objectIndex]?.hitSample??{normalSet:0,additionSet:0,index:0,volume:0,filename:""},d=a.hitSound,m=c.normalSet||l.sampleSet||1,f=c.additionSet||m,h=c.index||l.sampleIndex||0,p=c.filename,b=Ye(c.volume,l.volume),S={objectId:`catch:${a.objectIndex}:hit:${i}`,normalSet:m,additionSet:f};e.push({beatmapMs:s,type:"normal",sampleSet:m,sampleIndex:h,customFile:p,volume:b,source:S}),d&2&&e.push({beatmapMs:s,type:"whistle",sampleSet:f,sampleIndex:h,customFile:p,volume:b,source:S}),d&4&&e.push({beatmapMs:s,type:"finish",sampleSet:f,sampleIndex:h,customFile:p,volume:b,source:S}),d&8&&e.push({beatmapMs:s,type:"clap",sampleSet:f,sampleIndex:h,customFile:p,volume:b,source:S})}}function zb(e,t,n,r,o,i){for(let[a,s]of n.entries()){let l=t.hitObjects[s.objectIndex],u=l?.time??s.time;if(s.judgement===0&&s.time>u+.5||s.comboIgnore&&s.strong===!0||s.time<i-10)continue;let c=s.time+o,d=lt(t,s.time),m=l?.hitSample??{normalSet:0,additionSet:0,index:0,volume:0,filename:""},f=m.normalSet||d.sampleSet||1,h=m.additionSet||f,p=m.index||d.sampleIndex||0,b=m.filename,S=Ye(m.volume,d.volume),g={objectId:`taiko:${s.objectIndex}:hit:${a}`,normalSet:f,additionSet:h},v=(s.hitSound&10)!==0;v?e.push({beatmapMs:c,type:"clap",sampleSet:h,sampleIndex:p,customFile:b,volume:S,source:g}):e.push({beatmapMs:c,type:"normal",sampleSet:f,sampleIndex:p,customFile:b,volume:S,source:g}),(s.hitSound&4)!==0&&e.push({beatmapMs:c,type:v?"whistle":"finish",sampleSet:h,sampleIndex:p,customFile:b,volume:S,source:g})}if(r!==null)for(let[a,s]of r.entries()){if(s.time<i-10)continue;let l=s.action==="LeftRim"||s.action==="RightRim",u=lt(t,s.time);e.push({beatmapMs:s.time+o,type:l?"clap":"normal",sampleSet:u.sampleSet||1,sampleIndex:u.sampleIndex||0,customFile:"",source:{objectId:`taiko:ghost:${a}`,normalSet:u.sampleSet||1,additionSet:u.sampleSet||1},volume:Ye(0,u.volume)})}}function lt(e,t){let n=e.timingPoints,r=n[ql(n,t,o=>o.time)-1];return{sampleSet:r?.sampleSet||1,sampleIndex:r?.sampleIndex??0,volume:r?.volume??100}}function Ye(e,t){let n=e>0?e:t;return Math.max(n,Ub)/100}function dn(e,t){for(let n of Xo(t)){let r=e.get(n);if(r!==void 0)return r;for(let[o,i]of e)if(ec(o)===n)return i}return null}function ec(e){return e.replaceAll("\\","/").replace(/^\.\//,"").toLowerCase()}function Xo(e){let t=ec(e);return Jl.some(n=>t.endsWith(n))?[t]:Jl.map(n=>`${t}${n}`)}function zo(e,t,n,r,o){if(r!=="")return Xo(r);let i=jb[t]??"normal",a=n>=2?String(n):"",s=o===1?"taiko-":"",l=[`${s}${i}-hit${e}${a}`];return a!==""&&l.push(`${s}${i}-hit${e}`),l.push(o===1?`taiko-hit${e}`:`hit${e}${a}`),l.flatMap(Xo)}function mr(e,t,n,r,o){let{mode:i,skinSounds:a,synthCache:s,ctx:l}=o;for(let u of zo(e,t,n,r,i)){let c=dn(a,u);if(c!==null)return c}return Gb(e,l,s)}function Gb(e,t,n){let r=n.get(e);if(r!==void 0)return r;let o=t.sampleRate,i;switch(e){case"normal":i=dr(t,o,800,.08,40);break;case"whistle":i=dr(t,o,1480,.14,20);break;case"finish":i=dr(t,o,440,.22,12);break;case"clap":i=Yb(t,o,.09,35);break;default:i=dr(t,o,800,.08,40);break}return n.set(e,i),i}function dr(e,t,n,r,o){let i=Math.floor(t*r),a=e.createBuffer(1,i,t),s=a.getChannelData(0),l=2*Math.PI*n;for(let u=0;u<i;u++){let c=u/t;s[u]=Math.sin(l*c)*Math.exp(-o*c)*.25}return a}function Yb(e,t,n,r){let o=Math.floor(t*n),i=e.createBuffer(1,o,t),a=i.getChannelData(0);for(let s=0;s<o;s++){let l=s/t;a[s]=(Math.random()*2-1)*Math.exp(-r*l)*.15}return i}var Kb=2,qb=500,Jb=2,fr=class{constructor(t){A(this,"schedule");A(this,"inputs");A(this,"ctx");A(this,"songGain");A(this,"effectsGain");A(this,"synthCache",new Map);A(this,"samples");A(this,"activeEffects",new Map);A(this,"storyboardSources",new Set);A(this,"sampleEndPrefix");A(this,"voices",new Map);A(this,"songSource",null);A(this,"timer",null);A(this,"soundIndex",0);A(this,"sampleIndex",0);A(this,"playing",!1);A(this,"disposed",!1);A(this,"generation",0);A(this,"presentationStartMs",0);A(this,"contextStart",0);A(this,"pausedMs",0);A(this,"beatmapHitsounds");A(this,"storyboardEnabled",!0);this.inputs=t,this.ctx=t.ctx,this.beatmapHitsounds=t.beatmapHitsounds??!0,this.songGain=this.ctx.createGain(),this.effectsGain=this.ctx.createGain(),this.songGain.connect(this.ctx.destination),this.effectsGain.connect(this.ctx.destination),this.schedule=t.schedule,this.samples=[...t.extraSamples??[]].sort((r,o)=>r.timeMs-o.timeMs);let n=-1/0;this.sampleEndPrefix=this.samples.map(r=>n=Math.max(n,r.timeMs+r.buffer.duration*1e3))}get activeSounds(){return this.beatmapHitsounds?this.inputs.mergedSounds:this.inputs.skinSounds}get currentTimeMs(){return this.playing?this.presentationStartMs+(this.ctx.currentTime-this.contextStart)*1e3:this.pausedMs}setSongVolume(t){this.songGain.gain.value=Math.max(0,Math.min(1,t))}setEffectsVolume(t){this.effectsGain.gain.value=Math.max(0,Math.min(1,t))}setStoryboardEnabled(t){if(!(this.disposed||t===this.storyboardEnabled)){this.storyboardEnabled=t;for(let n of this.storyboardSources){n.onended=null;try{n.stop()}catch{}n.disconnect(),this.activeEffects.get(n)?.disconnect(),this.activeEffects.delete(n)}this.storyboardSources.clear(),this.sampleIndex=t?this.firstLiveSample(this.currentTimeMs+this.inputs.introOffsetMs):this.samples.length,this.playing&&(this.flush(),this.ensureTimer())}}firstLiveSample(t){let n=0,r=this.sampleEndPrefix.length;for(;n<r;){let o=n+r>>>1;this.sampleEndPrefix[o]<=t?n=o+1:r=o}return n}setBeatmapHitsounds(t){t!==this.beatmapHitsounds&&(this.beatmapHitsounds=t,this.playing&&(this.stopEffects(),this.startEffects(this.currentTimeMs)))}async playFrom(t){if(this.disposed)return;this.pause(),this.pausedMs=t;let n=++this.generation;await this.ctx.resume(),!(this.disposed||n!==this.generation)&&(this.presentationStartMs=t,this.contextStart=this.ctx.currentTime,this.playing=!0,this.startSong(t),this.startEffects(t))}pause(){if(this.generation++,this.pausedMs=this.currentTimeMs,this.playing=!1,this.songSource!==null){let t=this.songSource;this.songSource=null,t.onended=null;try{t.stop()}catch{}t.disconnect()}this.stopEffects()}destroy(){this.disposed||(this.pause(),this.disposed=!0,this.songGain.disconnect(),this.effectsGain.disconnect())}startSong(t){let n=this.inputs.songBuffer;if(!n)return;let r=t+this.inputs.introOffsetMs,o=Math.max(0,r/1e3);if(o>=n.duration)return;let i=this.ctx.createBufferSource();i.buffer=n,i.playbackRate.value=1,i.connect(this.songGain),this.songSource=i,i.onended=()=>{this.songSource===i&&(this.songSource=null),i.disconnect()},i.start(this.contextStart+Math.max(0,-r/1e3),o)}startEffects(t){let n=t+this.inputs.introOffsetMs,r=0,o=this.schedule.length;for(;r<o;){let i=r+o>>>1;this.schedule[i].beatmapMs<n?r=i+1:o=i}this.soundIndex=r,this.sampleIndex=this.storyboardEnabled?this.firstLiveSample(n):this.samples.length,this.flush(),this.ensureTimer()}ensureTimer(){this.timer===null&&(this.soundIndex<this.schedule.length||this.sampleIndex<this.samples.length)&&(this.timer=setInterval(()=>this.flush(),qb))}flush(){if(!this.playing)return;let n=this.ctx.currentTime+Kb,r=this.presentationStartMs+this.inputs.introOffsetMs,o=i=>this.contextStart+(i-r)/1e3;for(;this.soundIndex<this.schedule.length;){let i=this.schedule[this.soundIndex],a=o(i.beatmapMs);if(a>n)break;this.soundIndex++;let s=i.type==="combobreak"||i.type==="spinnerbonus"?dn(this.activeSounds,i.type):mr(i.type,i.sampleSet,i.sampleIndex,this.beatmapHitsounds?i.customFile:"",{mode:this.inputs.mode,skinSounds:this.activeSounds,synthCache:this.synthCache,ctx:this.ctx});if(!s)continue;let l=`${i.type}|${i.sampleSet}|${i.sampleIndex}|${i.customFile}`;this.startEffect(s,a,i.volume??1,l)}for(;this.sampleIndex<this.samples.length;){let i=this.samples[this.sampleIndex],a=o(i.timeMs);if(a>n)break;this.sampleIndex++,this.startEffect(i.buffer,a,i.volume,void 0,!0)}this.soundIndex===this.schedule.length&&this.sampleIndex===this.samples.length&&this.timer!==null&&(clearInterval(this.timer),this.timer=null)}startEffect(t,n,r,o,i=!1){let a=this.ctx.currentTime,s=Math.max(0,a-n);if(s>=t.duration)return;let l=Math.max(a,n),u=this.ctx.createBufferSource();u.buffer=t,u.playbackRate.value=1;let c=Math.max(0,Math.min(1,r)),d=c===1?null:this.ctx.createGain();if(d?(d.gain.value=c,u.connect(d),d.connect(this.effectsGain)):u.connect(this.effectsGain),this.activeEffects.set(u,d),i&&this.storyboardSources.add(u),u.onended=()=>{u.disconnect(),d?.disconnect(),this.activeEffects.delete(u),this.storyboardSources.delete(u)},o){let m=(this.voices.get(o)??[]).filter(f=>f.end>l);if(m.length>=Jb){let f=m.shift();try{f.source.stop(l)}catch{}}m.push({source:u,when:l,end:l+(t.duration-s)}),this.voices.set(o,m)}u.start(l,s)}stopEffects(){this.timer!==null&&clearInterval(this.timer),this.timer=null;for(let[t,n]of this.activeEffects){t.onended=null;try{t.stop()}catch{}t.disconnect(),n?.disconnect()}this.activeEffects.clear(),this.storyboardSources.clear(),this.voices.clear()}};function tc(e,t){let n=[],r=[],o=a=>t?e[a]|e[a+1]<<8:e[a]<<8|e[a+1],i=2;for(;i+1<e.length;i+=2){let a=o(i);if(a>=55296&&a<=56319){let s=i+3<e.length?o(i+2):0;s>=56320&&s<=57343?(n.push(a,s),i+=2):n.push(65533)}else n.push(a>=56320&&a<=57343?65533:a);n.length>=4096&&(r.push(String.fromCharCode(...n)),n.length=0)}return i<e.length&&n.push(65533),r.push(String.fromCharCode(...n)),r.join("")}function fn(e){return e.length>=2&&e[0]===255&&e[1]===254?tc(e,!0):e.length>=2&&e[0]===254&&e[1]===255?tc(e,!1):new TextDecoder("utf-8").decode(e)}function mn(e){let t=e.replace(/\\/g,"/");if(/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(t))return"";let n=[];for(let r of t.split("/"))if(!(!r||r==="."))if(r===".."){if(!n.length)return"";n.pop()}else n.push(r);return n.join("/")}function kt(e,t=""){let n=e.replace(/\\/g,"/");if(/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(n))return"";let r=mn(t),o=r.includes("/")?r.slice(0,r.lastIndexOf("/")+1):"";return mn(o+n)}function Zb(e){let t=mn(e),n=t.lastIndexOf("/");return n>=0?t.slice(n+1):t}function Qb(e){return Zb(e).toLowerCase().endsWith(".osb")}function It(e,t,n=""){let r=kt(t,n).toLowerCase();if(r){for(let[o,i]of e)if(mn(o).toLowerCase()===r)return{path:o,resource:i}}}function nc(e,t,n=""){let r=It(e,t,n);return r?.resource instanceof Uint8Array?{path:r.path,bytes:r.resource}:void 0}function rc(e,t){let n=o=>mn(o).split("/").slice(0,-1).join("/").toLowerCase(),r=n(t);return[...e.entries()].filter(o=>o[1]instanceof Uint8Array&&Qb(o[0])&&n(o[0])===r).sort(([o],[i])=>o.localeCompare(i,"en")).map(([o,i])=>({path:o,text:fn(i)}))}var pn=class extends Error{constructor(t){super(t),this.name="ChartPreviewBudgetError"}},ct=class extends pn{constructor(t){super(t),this.name="ChartPreviewBudgetExceededError"}};function pr(e){if(e?.assertCurrent?.(),!e?.signal?.aborted)return;let t=e.signal.reason;throw t instanceof Error?t:new Error("\u64CD\u4F5C\u5DF2\u53D6\u6D88")}function hn(e,t){e%128===0&&pr(t)}async function oc(e,t,n){hn(e,t),!(e===0||e%128!==0)&&(n?.resumedAt!==void 0&&performance.now()-n.resumedAt<8||(await new Promise(r=>{setTimeout(r,0)}),pr(t),n&&(n.resumedAt=performance.now())))}function ic(e){if(!Number.isFinite(e)||e<0||e>2e5)throw new ct("\u6545\u4E8B\u677F\u4E8B\u4EF6\u6570\u91CF\u8D85\u51FA\u9884\u7B97")}function ac(e){if(!Number.isInteger(e)||e<0||e>32)throw new ct("\u8C31\u9762\u5D4C\u5957\u6DF1\u5EA6\u8D85\u51FA\u9884\u7B97")}function sc(e){if(!Number.isFinite(e)||e<0||e>4096)throw new ct("\u6545\u4E8B\u677F\u5FAA\u73AF\u8D85\u51FA\u9884\u7B97")}function lc(e){if(!Number.isFinite(e)||e<0||e>16777216)throw new ct("\u7EB9\u7406\u50CF\u7D20\u8D85\u51FA\u9884\u7B97")}function cc(e){if(!Number.isFinite(e)||e<0||e>4194304)throw new ct("GIF \u5E27\u50CF\u7D20\u8D85\u51FA\u9884\u7B97")}function tg(e,t){return $t(e,t,[],0)}function hr(e){return Ar(fn(e))}function*uc(e,t){let n=tg(e,t),r=Ut(e,n);if(e.mode===1){yield*Ur(e,r);return}if(e.mode===2){let o=zt(e,r);Gt(o,e,r),yield*Gr(o,r);return}if(e.mode===3){yield*Vr(e,r);return}Lr(e,r),yield*Fr(e,r)}async function ng(e,t,n){n.throwIfAborted();let r=e instanceof Uint8Array?hr(e):e,o=[],i={signal:n},a={};for(let s of uc(r,t))o.push(s),o.length%128===0&&await oc(o.length,i,a);return n.throwIfAborted(),$t(r,t,o)}function dc(e,t,n){if(n)return ng(e,t,n);let r=e instanceof Uint8Array?hr(e):e;return $t(r,t,uc(r,t))}function Et(e){let t=new Uint8Array(e.byteLength);return t.set(e),t.buffer}var br=["Background","Fail","Pass","Foreground","Overlay"],bc=["Background","Pass","Foreground"],gc=["Overlay"],mc=["TopLeft","Centre","CentreLeft","TopRight","BottomCentre","TopCentre","Custom","CentreRight","BottomLeft","BottomRight"],og=["BACKGROUND","VIDEO","BREAK","COLOUR","SPRITE","SAMPLE","ANIMATION"];function ig(e){let t=[],n="",r=!1;for(let o=0;o<e.length;o+=1){let i=e[o];i==='"'?r&&e[o+1]==='"'?(n+='"',o+=1):r=!r:i===","&&!r?(t.push(n.trim()),n=""):n+=i}return t.push(n.trim()),t}function ne(e,t=0){if(e===void 0||e.trim()==="")return t;let n=Number(e);return Number.isFinite(n)?n:t}function fc(e=""){return br[Number(e)]??br.find(t=>t.toLowerCase()===e.toLowerCase())??"Background"}function ag(e=""){return e.toLowerCase()==="center"?"Centre":mc[Number(e)]??mc.find(t=>t.toLowerCase()===e.toLowerCase())??"Centre"}function yc(e,t){let n=!1,r=!1,o=[];for(let i of e.split(/\r?\n/)){let a=/^\s*\[([^\]]+)\]\s*$/.exec(i);a?(r=!0,n=a[1].toLowerCase()===t.toLowerCase()):n&&o.push(i)}return!r&&t==="Events"?e.split(/\r?\n/):o}function sg(e){let t=new Map;for(let n of yc(e,"Variables")){let r=/^\s*(\$[^=\s]+)\s*=(.*)$/.exec(n);r&&t.set(r[1],r[2].trim())}return t}function lg(e,t){let n=[...t.keys()].sort((i,a)=>a.length-i.length),r=new Set,o=e;for(;o.includes("$")&&!r.has(o);){r.add(o);let i=o;for(let a of n)i=i.split(a).join(t.get(a));if(i===o||(o=i,r.size>t.size+1))break}return o}function cg(e){let t=e[0]?.toUpperCase(),n=ne(e[1]),r=ne(e[2]),o=Math.max(r,ne(e[3],r));if(t==="P"){let c=e[4]?.toUpperCase();return c==="H"||c==="V"||c==="A"?[{type:t,easing:n,start:r,end:o,parameter:c}]:[]}let i=t==="C"?3:t==="M"||t==="V"?2:1;if(!["F","MX","MY","S","R","M","V","C"].includes(t??""))return[];let a=t==="C"?255:t==="S"||t==="V"?1:0,s=e.slice(4).map(c=>ne(c,a));for(;s.length<i;)s.push(a);let l=[];for(let c=0;c+i<=s.length;c+=i)l.push(s.slice(c,c+i));l.length===1&&l.push(l[0]);let u=[];for(let c=0;c<l.length-1;c+=1){let d=l[c],m=l[c+1],f={easing:n,start:r+(o-r)*c,end:o+(o-r)*c};t==="M"||t==="V"?u.push({...f,type:t,startX:d[0],startY:d[1],endX:m[0],endY:m[1]}):t==="C"?u.push({...f,type:t,startR:d[0],startG:d[1],startB:d[2],endR:m[0],endG:m[1],endB:m[2]}):u.push({...f,type:t,startValue:d[0],endValue:m[0]})}return u}function Sc(e){e.events+=1,ic(e.events),hn(e.events,e.cancellation)}function ug(e){let t=1/0,n=-1/0;for(let r of e.commands)t=Math.min(t,r.start),n=Math.max(n,r.end);for(let r of e.loops){let o=je(r);t=Math.min(t,o.start),n=Math.max(n,o.end)}return{first:t,end:n}}function vc(e,t,n,r){ac(n);let o=[],i=[],a=[];for(let s=0;s<e.length;s+=1){let l=e[s];Sc(r);let u=l.parts[0]?.toUpperCase();if(u!=="L"&&u!=="T"){o.push(...cg(l.parts).map(v=>({...v,start:v.start+t,end:v.end+t})));continue}let c=s+1;for(;c<e.length&&e[c].indent>l.indent;)c+=1;let d=vc(e.slice(s+1,c),0,n+1,r);if(s=c-1,u==="T"){i.push({name:l.parts[1]??"",start:ne(l.parts[2],-1/0),end:ne(l.parts[3],1/0),group:ne(l.parts[4]),commands:d.commands,...d.loops.length>0?{loops:d.loops}:{}});continue}let m=ne(l.parts[1])+t,f=Math.max(1,Math.floor(ne(l.parts[2],1)));if(d.commands.length===0&&d.loops.length===0)continue;let h=ug(d),p=h.end-h.first,b=p===0?1:f,S=b*Math.max(1,d.commands.length+d.loops.length),g=p>0?p*(b-1):0;if((!Number.isFinite(m)||!Number.isFinite(g)||!Number.isFinite(S))&&sc(Number.NaN),d.loops.length===0&&S<=4096){for(let v=0;v<b;v+=1){hn(v,r.cancellation);let x=m+p*v;for(let k of d.commands)o.push({...k,start:k.start+x,end:k.end+x})}continue}a.push({start:m,count:b,duration:p===0?0:p,commands:d.commands,...d.loops.length>0?{loops:d.loops}:{}})}return{commands:o,triggers:i,loops:a}}function pc(e,t,n,r){let o=sg(e),i=yc(e,"Events").filter(s=>s.trim()&&!s.trimStart().startsWith("//")).map(s=>{let l=lg(s,o),u=/^[ _\t]*/.exec(l)[0].length;return{indent:u,parts:ig(l.slice(u))}}),a={background:null,backgroundOffset:{x:0,y:0},video:null,objects:[],samples:[]};for(let s=0;s<i.length;s+=1){let l=i[s];if(l.indent>0)continue;Sc(r);let u=l.parts,c=u[0]?.toUpperCase()??"",d=/^\d+$/.test(c)?og[Number(c)]:c;if(d==="BACKGROUND"&&!a.background)a.background=kt(u[2]??"",t)||null,a.backgroundOffset={x:ne(u[3]),y:ne(u[4])};else if(d==="VIDEO"&&!a.video){let m=kt(u[2]??"",t);m&&(a.video={file:m,startMs:ne(u[1])})}else if(d==="SAMPLE"){let m=kt(u[3]??"",t);m&&a.samples.push({file:m,timeMs:ne(u[1]),layer:fc(u[2]),volume:Math.max(0,Math.min(100,ne(u[4],100)))/100})}else if(d==="SPRITE"||d==="ANIMATION"){let m=s+1;for(;m<i.length&&i[m].indent>0;)m+=1;let f=vc(i.slice(s+1,m),0,1,r);s=m-1;let h=kt(u[3]??"",t);if(!h)continue;let p=Math.max(1,ne(u[7],1e3)),b=n<6?Math.round(.015*p)*1.186*1e3/60:p;a.objects.push({kind:d==="ANIMATION"?"Animation":"Sprite",layer:fc(u[1]),origin:ag(u[2]),file:h,x:ne(u[4]),y:ne(u[5]),frameCount:d==="ANIMATION"?Math.max(1,Math.floor(ne(u[6],1))):1,frameDelay:Math.max(1,b),loopForever:!["looponce","1"].includes((u[8]??"").toLowerCase()),commands:f.commands,triggers:f.triggers,...f.loops.length>0?{loops:f.loops}:{}})}}return a}function wc(e,t=[],n={}){let r={events:0,cancellation:n.cancellation};pr(r.cancellation);let o=ne(/^\s*osu file format v(\d+)/im.exec(e)?.[1],14),i=pc(e,n.osuPath??"",o,r);for(let a=0;a<t.length;a+=1){hn(a,r.cancellation);let s=pc(t[a],n.osbPaths?.[a]??"",o,r);i.objects.push(...s.objects),i.samples.push(...s.samples),i.video??(i.video=s.video)}return{widescreen:/^\s*WidescreenStoryboard\s*:\s*1\s*$/im.test(e),...i}}function Go(e,t){let n=Math.max(e.lastIndexOf("/"),e.lastIndexOf("\\")),r=e.lastIndexOf(".");return r>n?`${e.slice(0,r)}${t}${e.slice(r)}`:`${e}${t}.png`}function xc(e){let t=new Map;for(let n of e)for(let r=0;r<n.frameCount;r+=1){let o=n.kind==="Animation"?Go(n.file,r):n.file;t.set(o.replace(/\\/g,"/").toLowerCase(),o)}return[...t.values()]}function je(e){let t=1/0,n=-1/0;for(let i of e.commands)t=Math.min(t,i.start),n=Math.max(n,i.end);for(let i of e.loops??[]){let a=je(i);t=Math.min(t,a.start),n=Math.max(n,a.end)}let r=e.duration===0?1:e.count,o=e.start+(e.duration>0?e.duration*(r-1):0);return{start:t+e.start,end:n+o}}function hc(e,t,n,r){if(!(e<=r))return null;if(!(t>0)||n<=1)return 0;let o=Math.floor((r-e)/t);return!Number.isFinite(o)||o<0?null:Math.min(n-1,o)}function dg(e,t){return{...e,start:e.start+t,end:e.end+t}}function Mc(e,t,n=0){let r=[];for(let o of e.commands){let i=n+e.start+o.start,a=hc(i,e.duration,e.count,t);if(a===null)continue;let s=n+e.start+(e.duration>0?e.duration*a:0);r.push(dg(o,s))}for(let o of e.loops??[]){let i=je(o),a=hc(n+e.start+i.start,e.duration,e.count,t);if(a===null)continue;let s=n+e.start+(e.duration>0?e.duration*a:0);r.push(...Mc(o,t,s))}return r}function Yo(e,t,n){return t?.length?[...e,...t.flatMap(r=>Mc(r,n))]:e}function Ko(e,t=[]){let n=0,r=0;for(let o of e){for(let i of o.commands)n=Math.min(n,i.start),r=Math.max(r,i.end);for(let i of o.loops??[]){let a=je(i);n=Math.min(n,a.start),r=Math.max(r,a.end)}for(let i of o.triggerRuns??[])n=Math.min(n,i.start),r=Math.max(r,i.end)}for(let o of t)n=Math.min(n,o.timeMs),r=Math.max(r,o.timeMs);return{startMs:n,endMs:r}}function qo(e){return{normal:1,soft:2,drum:3}[e?.toLowerCase()??""]??null}function mg(e){let t=/^HitSound(All|Normal|Soft|Drum)?(All|Normal|Soft|Drum)?(Whistle|Clap|Finish)?(\d+)?$/i.exec(e);if(!t)return null;let n=t[1]!==void 0&&t[2]===void 0&&t[3]!==void 0;return{normalSet:n?null:qo(t[1]),additionSet:qo(n?t[1]:t[2]),addition:t[3]?.toLowerCase()??null,sampleIndex:t[4]===void 0?null:Number(t[4])}}function fg(e,t){return(e.normalSet===null||e.normalSet===t.normalSet)&&(e.additionSet===null||e.additionSet===t.additionSet)&&(e.addition===null||e.addition===t.type)&&(e.sampleIndex===null||e.sampleIndex===t.sampleIndex)}function pg(e,t){return{...e,start:e.start+t}}function hg(e){let t=1/0,n=-1/0;for(let r of e.commands)t=Math.min(t,r.start),n=Math.max(n,r.end);for(let r of e.loops??[]){let o=je(r);t=Math.min(t,o.start),n=Math.max(n,o.end)}return{start:t,end:n}}function Tc(e,t){let n=[...t].filter(r=>Number.isFinite(r.beatmapMs)).sort((r,o)=>r.beatmapMs-o.beatmapMs);return e.map(r=>{let o=r.triggers??[];if(o.length===0)return r;let i=o.map((c,d)=>({trigger:c,index:d,filter:mg(c.name),range:hg(c)})).filter(c=>c.filter!==null&&Number.isFinite(c.range.end)),a=r.commands.reduce((c,d)=>Math.max(c,d.end),-1/0);for(let c of r.loops??[])a=Math.max(a,je(c).end);let s=[],l=new Map,u=new Map;for(let c of n)if(!(c.beatmapMs<a))for(let d of i){let{trigger:m,index:f,range:h,filter:p}=d;if(c.beatmapMs<m.start||c.beatmapMs>m.end||!fg(p,c))continue;let b=JSON.stringify([c.beatmapMs,c.objectId]),S=u.get(f);if(S||(S=new Set,u.set(f,S)),S.has(b))continue;S.add(b);let g=m.group===0?`trigger:${f}`:`group:${m.group}`,v=l.get(g);v&&v.end>=c.beatmapMs&&(v.end=c.beatmapMs,v.stopMs=c.beatmapMs);let x={start:c.beatmapMs+Math.max(0,h.start),end:c.beatmapMs+h.end,activationMs:c.beatmapMs,commands:m.commands.map(k=>({...k,start:c.beatmapMs+k.start,end:c.beatmapMs+k.end})),...m.loops?.length?{loops:m.loops.map(k=>pg(k,c.beatmapMs))}:{}};s.push(x),l.set(g,x)}return{...r,triggerRuns:s.filter(c=>c.end>=c.start)}})}var Ac=1280,ei=720,At=ei/480,Cc=(Ac-640*At)/2,bg={TopLeft:[0,0],TopCentre:[.5,0],TopRight:[1,0],CentreLeft:[0,.5],Centre:[.5,.5],CentreRight:[1,.5],BottomLeft:[0,1],BottomCentre:[.5,1],BottomRight:[1,1],Custom:[0,0]};function gr(e){return e<1/2.75?7.5625*e*e:e<2/2.75?7.5625*(e-1.5/2.75)**2+.75:e<2.5/2.75?7.5625*(e-2.25/2.75)**2+.9375:7.5625*(e-2.625/2.75)**2+.984375}function yr(e,t=1){let n=r=>Math.sin((t*r-.075)*2*Math.PI/.3);return 1+2**(-10*e)*n(e)-2**-10*n(1)*e}function gg(e,t){let n=Math.max(0,Math.min(1,t));if(n===0||n===1)return n;switch(e|0){case 1:case 4:return n*(2-n);case 2:case 3:return n*n;case 5:return n<.5?2*n*n:1-2*(1-n)**2;case 6:return n**3;case 7:return 1-(1-n)**3;case 8:return n<.5?4*n**3:1-4*(1-n)**3;case 9:return n**4;case 10:return 1-(1-n)**4;case 11:return n<.5?8*n**4:1-8*(1-n)**4;case 12:return n**5;case 13:return 1-(1-n)**5;case 14:return n<.5?16*n**5:1-16*(1-n)**5;case 15:return 1-Math.cos(n*Math.PI/2);case 16:return Math.sin(n*Math.PI/2);case 17:return(1-Math.cos(n*Math.PI))/2;case 18:return 2**(10*(n-1))+2**-10*(n-1);case 19:return 1-2**(-10*n)+2**-10*n;case 20:return n<.5?(2**(20*n-10)+2**-10*(2*n-1))/2:1-(2**(10-20*n)+2**-10*(1-2*n))/2;case 21:return 1-Math.sqrt(1-n*n);case 22:return Math.sqrt(1-(n-1)**2);case 23:return n<.5?(1-Math.sqrt(1-(2*n)**2))/2:(1+Math.sqrt(1-(2*n-2)**2))/2;case 24:return 1-yr(1-n);case 25:return yr(n);case 26:return yr(n,.5);case 27:return yr(n,.25);case 28:{let r=i=>Math.sin((i-.1125)*2*Math.PI/.45),o=.0009765625*r(1);return n<.5?-(2**(20*n-10)*r(1-2*n)-o*(1-2*n))/2:1+(2**(10-20*n)*r(2*n-1)-o*(2*n-1))/2}case 29:return n*n*(2.70158*n-1.70158);case 30:return 1+(n-1)**2*(2.70158*(n-1)+1.70158);case 31:{let r=2.5949095;return n<.5?(2*n)**2*((r+1)*2*n-r)/2:((2*n-2)**2*((r+1)*(2*n-2)+r)+2)/2}case 32:return 1-gr(1-n);case 33:return gr(n);case 34:return n<.5?(1-gr(1-2*n))/2:(1+gr(2*n-1))/2;default:return n}}var kc=new WeakMap;function Sr(e){let t=kc.get(e);if(t)return t;let n={x:[],y:[],fade:[],uniform:[],vectorX:[],vectorY:[],rotation:[],r:[],g:[],b:[]},r={tracks:n,parameters:[],start:1/0,end:-1/0};for(let o of e){r.start=Math.min(r.start,o.start),r.end=Math.max(r.end,o.end);let i=(a,s,l)=>{n[a].push({start:o.start,end:o.end,easing:o.easing,from:s,to:l})};switch(o.type){case"F":i("fade",o.startValue,o.endValue);break;case"MX":i("x",o.startValue,o.endValue);break;case"MY":i("y",o.startValue,o.endValue);break;case"S":i("uniform",o.startValue,o.endValue);break;case"R":i("rotation",o.startValue,o.endValue);break;case"M":i("x",o.startX,o.endX),i("y",o.startY,o.endY);break;case"V":i("vectorX",o.startX,o.endX),i("vectorY",o.startY,o.endY);break;case"C":i("r",o.startR,o.endR),i("g",o.startG,o.endG),i("b",o.startB,o.endB);break;case"P":r.parameters.push(o);break}}for(let o of Object.values(n))o.sort((i,a)=>i.start-a.start);if(n.fade[0]?.from===0){let o=n.fade.find(i=>i.from>0||i.to>0);o&&(r.start=o.start)}return r.parameters.sort((o,i)=>o.start-i.start),kc.set(e,r),r}function yg(e,t){let n=0,r=e.length;for(;n<r;){let o=n+r>>>1;e[o].start<=t?n=o+1:r=o}return e[Math.max(0,n-1)]}function Oe(e,t,n){let r=yg(e,t);if(!r)return n;if(t<r.start)return r.from;let o=r.end-r.start,i=o<=0?1:gg(r.easing,(t-r.start)/o);return r.from+(r.to-r.from)*i}function Jo(e,t,n){let r;for(let o of e){if(o.start>t)break;o.parameter===n&&(r=o)}return r!==void 0&&(r.start===r.end||t<=r.end)}var Ic=new WeakMap;function Rc(e){if(!e?.length)return null;let t=1/0,n=-1/0;for(let r of e){let o=je(r);t=Math.min(t,o.start),n=Math.max(n,o.end)}return{start:t,end:n}}function Sg(e,t){let n=Rc(e.loops),r=n?Yo(e.commands,e.loops,t):e.commands,o=Sr(r),i=o.start,a=o.end;n&&(i=Math.min(i,n.start),a=Math.max(a,n.end));let s=t>=i&&t<=a;if(!e.triggerRuns?.length)return s?{commands:o,start:i}:null;let l=e.triggerRuns.filter(d=>t>=d.start&&t<=d.end&&(d.stopMs===void 0||t<d.stopMs));if(!s&&l.length===0)return null;if(l.length===0)return{commands:o,start:i};if(!(n!==null||l.some(d=>(d.loops?.length??0)>0))){let d=Ic.get(e);if(d&&d.runs.length===l.length&&d.runs.every((f,h)=>f===l[h]))return{commands:d.commands,start:s?i:l[l.length-1].start};let m=Sr([...r,...l.flatMap(f=>f.commands)]);return Ic.set(e,{runs:l,commands:m}),{commands:m,start:s?i:l[l.length-1].start}}return{commands:Sr([...r,...l.flatMap(d=>Yo(d.commands,d.loops,t))]),start:s?i:l[l.length-1].start}}function vg(e,t){let n=Sg(e,t);if(!n)return null;let{tracks:r,parameters:o}=n.commands,i=Oe(r.fade,t,1);if(i>1&&(i%=1),i<=0)return null;let a=Oe(r.uniform,t,1),s=e.file;if(e.kind==="Animation"){let l=Math.floor(Math.max(0,t-n.start)/e.frameDelay);s=Go(s,e.loopForever?l%e.frameCount:Math.min(e.frameCount-1,l))}return{x:Oe(r.x,t,e.x),y:Oe(r.y,t,e.y),fade:i,scaleX:a*Oe(r.vectorX,t,1),scaleY:a*Oe(r.vectorY,t,1),rotation:Oe(r.rotation,t,0),r:Oe(r.r,t,255),g:Oe(r.g,t,255),b:Oe(r.b,t,255),flipH:Jo(o,t,"H"),flipV:Jo(o,t,"V"),additive:Jo(o,t,"A"),file:s}}function ti(e){let t=e;return{width:Number(t.videoWidth??t.width??0),height:Number(t.videoHeight??t.height??0)}}function ni(e,t,n=Ac,r=ei){let o=ti(t);if(o.width<=0||o.height<=0)return;let i=Math.max(n/o.width,r/o.height),a=o.width*i,s=o.height*i;e.drawImage(t,(n-a)/2,(r-s)/2,a,s)}function wg(e,t,n,r,o=new Uint8ClampedArray(e.length)){let i=Math.max(0,Math.min(255,t))/255,a=Math.max(0,Math.min(255,n))/255,s=Math.max(0,Math.min(255,r))/255;for(let l=0;l<e.length;l+=4)o[l]=e[l]*i,o[l+1]=e[l+1]*a,o[l+2]=e[l+2]*s,o[l+3]=e[l+3];return o}var xg=32*1024*1024,Rt=new Map,ut=new Map,vr=0,bn,Pt=new Map;function Pc(e,t,n){let r=`${e},${t},${n}`,o=Pt.get(r);if(o)return o;let i=`<svg xmlns="http://www.w3.org/2000/svg"><filter id="c" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${e/255} 0 0 0 0 0 ${t/255} 0 0 0 0 0 ${n/255} 0 0 0 0 0 1 0"/></filter></svg>`,a=`url(data:image/svg+xml,${encodeURIComponent(i)}#c)`;return Pt.size>=1024&&Pt.delete(Pt.keys().next().value),Pt.set(r,a),a}function Mg(e){if(typeof document>"u"||typeof CanvasRenderingContext2D>"u"||!(e instanceof CanvasRenderingContext2D))return!1;if(bn!==void 0)return bn;let t=document.createElement("canvas");t.width=2,t.height=1;let n=t.getContext("2d",{willReadFrequently:!0});if(!n)return bn=!1;n.fillStyle="#ff4020",n.fillRect(0,0,1,1),n.fillStyle="rgba(255,64,32,0.5019607843137255)",n.fillRect(1,0,1,1);let r=document.createElement("canvas");r.width=2,r.height=1,r.getContext("2d").drawImage(t,0,0),n.clearRect(0,0,2,1),n.filter=Pc(128,255,0),n.drawImage(r,0,0);let i=n.getImageData(0,0,2,1).data;return bn=i[0]===128&&i[1]===64&&i[2]===0&&i[3]===255&&i[4]===128&&i[5]===64&&i[6]===0&&i[7]===128,t.width=r.width=0,bn}function _c(){for(let e of ut.keys())e.canvas.width=0,e.canvas.height=0;Rt.clear(),ut.clear(),Pt.clear(),vr=0}function Tg(e,t,n,r){let o=Math.round(Math.max(0,Math.min(255,t))),i=Math.round(Math.max(0,Math.min(255,n))),a=Math.round(Math.max(0,Math.min(255,r)));if(o===255&&i===255&&a===255)return e;let s=`${o},${i},${a}`,l=Rt.get(e)?.get(s);if(l)ut.delete(l);else{let u=ti(e),c=typeof OffscreenCanvas<"u"?new OffscreenCanvas(u.width,u.height):document.createElement("canvas");c.width=u.width,c.height=u.height;let d=c.getContext("2d",{willReadFrequently:!0});if(!d)return e;d.drawImage(e,0,0);let m=d.getImageData(0,0,u.width,u.height);wg(m.data,o,i,a,m.data),d.putImageData(m,0,0);let f=u.width*u.height*4;for(;ut.size>0&&vr+f>xg;){let[p,b]=ut.entries().next().value;vr-=p.bytes,p.canvas.width=0,p.canvas.height=0,ut.delete(p);let S=Rt.get(b.image);S.delete(b.colour),S.size||Rt.delete(b.image)}l={canvas:c,bytes:f};let h=Rt.get(e)??new Map;h.set(s,l),Rt.set(e,h),vr+=f}return ut.set(l,{image:e,colour:s}),l.canvas}var Ec=new WeakMap;function Zo(e){if(!e.length)return null;let t=e.map(a=>a.start).sort((a,s)=>a-s),n=t[t.length>>>1],r=[],o=[],i=[];for(let a of e)a.end<n?r.push(a):a.start>n?o.push(a):i.push(a);return{centre:n,byStart:i.sort((a,s)=>a.start-s.start),byEnd:[...i].sort((a,s)=>s.end-a.end),left:Zo(r),right:Zo(o)}}function Cg(e){let t=Ec.get(e);if(t)return t;let n=new Map;e.forEach((o,i)=>{let a=n.get(o.layer)??[],s=Sr(o.commands),l=Rc(o.loops),u=l?Math.min(s.start,l.start):s.start,c=l?Math.max(s.end,l.end):s.end;u<=c&&a.push({start:u,end:c,object:o,order:i});for(let d of o.triggerRuns??[]){let m=Math.min(d.end,d.stopMs??1/0);d.start<=m&&a.push({start:d.start,end:m,object:o,order:i})}n.set(o.layer,a)});let r=new Map([...n].map(([o,i])=>[o,Zo(i)]));return Ec.set(e,r),r}function Qo(e,t,n){if(e)if(t<e.centre){for(let r of e.byStart){if(r.start>t)break;n.set(r.order,r.object)}Qo(e.left,t,n)}else{for(let r of e.byEnd){if(r.end<t)break;n.set(r.order,r.object)}Qo(e.right,t,n)}}function ri(e,t,n,r,o,i){e.save();let a=Cg(t),s=Mg(e);i||(e.beginPath(),e.rect(Cc,0,640*At,ei),e.clip());for(let l of br){if(!r.includes(l))continue;let u=new Map;Qo(a.get(l)??null,n,u);for(let[,c]of[...u].sort((d,m)=>d[0]-m[0])){let d=vg(c,n);if(!d)continue;let m=o(d.file);if(!m)continue;let f=ti(m);if(f.width<=0||f.height<=0)continue;let h=bg[c.origin],p=d.scaleX*(d.flipH?-1:1),b=d.scaleY*(d.flipV?-1:1);e.save(),e.globalAlpha=Math.min(1,d.fade),e.translate(Cc+d.x*At,d.y*At),e.rotate(d.rotation),e.scale(p*At,b*At),e.globalCompositeOperation=d.additive?"lighter":"source-over";let S=f.width*(p<0?1-h[0]:h[0]),g=f.height*(b<0?1-h[1]:h[1]),v=m;if(s){let x=Math.round(Math.max(0,Math.min(255,d.r))),k=Math.round(Math.max(0,Math.min(255,d.g))),M=Math.round(Math.max(0,Math.min(255,d.b)));(x!==255||k!==255||M!==255)&&(e.filter=Pc(x,k,M))}else v=Tg(m,d.r,d.g,d.b);e.drawImage(v,-S,-g,f.width,f.height),e.restore()}}e.restore()}function Lc(e){let t=Math.ceil(e*3),n=Array.from({length:t+1},(i,a)=>Math.exp(-a*a/(2*e*e))),r=n[0]+n.slice(1).reduce((i,a)=>i+a*2,0),o=[{offset:0,weight:n[0]/r}];for(let i=1;i<=t;i+=2){let a=n[i],s=n[i+1]??0,l=a+s,u=(i*a+(i+1)*s)/l;o.push({offset:u,weight:l/r},{offset:-u,weight:l/r})}return o}function kg(){let e=document.createElement("canvas");e.width=e.height=18;try{let t=e.getContext("2d",{willReadFrequently:!0});if(!t||!("filter"in t))return!1;t.filter="blur(2px)",t.fillStyle="#fff",t.fillRect(8,8,2,2);let n=t.getImageData(6,8,1,1).data[3],r=t.getImageData(8,8,1,1).data[3];return n>0&&r>n&&r<255}catch{return!1}finally{e.width=e.height=0}}var wr=class{constructor(){A(this,"native");A(this,"horizontal",null);A(this,"result",null);A(this,"key","");A(this,"tapsKey","");A(this,"horizontalTaps",[]);A(this,"verticalTaps",[])}draw(t,n,r,o){if(this.native??(this.native=kg()),this.native){t.save(),t.filter=`blur(${r}px)`,t.drawImage(n,0,0),t.restore();return}let i=t.canvas.width,a=t.canvas.height,s=Math.max(r*n.width/i,r*n.height/a),l=Math.max(1,s/2),u=Math.ceil(n.width/l),c=Math.ceil(n.height/l),d=`${o}:${r}:${i}:${a}:${n.width}:${n.height}`;if(d!==this.key){this.horizontal??(this.horizontal=document.createElement("canvas")),this.result??(this.result=document.createElement("canvas"));for(let g of[this.horizontal,this.result])(g.width!==u||g.height!==c)&&(g.width=u,g.height=c);let m=this.horizontal.getContext("2d"),f=this.result.getContext("2d"),h=r*u/i,p=r*c/a,b=`${h}:${p}`;b!==this.tapsKey&&(this.horizontalTaps=Lc(h),this.verticalTaps=Lc(p),this.tapsKey=b),f.clearRect(0,0,u,c),f.imageSmoothingEnabled=!0,f.imageSmoothingQuality="high",f.drawImage(n,0,0,u,c);let S=(g,v,x,k)=>{g.save(),g.clearRect(0,0,u,c),g.imageSmoothingEnabled=!0,g.imageSmoothingQuality="low",g.globalCompositeOperation="lighter";for(let M of x)g.globalAlpha=M.weight,g.drawImage(v,k?0:M.offset,k?M.offset:0);g.restore()};S(m,this.result,this.horizontalTaps,!1),S(f,this.horizontal,this.verticalTaps,!0),this.key=d}t.drawImage(this.result,0,0,n.width,n.height)}dispose(){this.horizontal&&(this.horizontal.width=this.horizontal.height=0),this.result&&(this.result.width=this.result.height=0),this.horizontal=this.result=null,this.key=this.tapsKey="",this.horizontalTaps=this.verticalTaps=[]}};function Oc(e){let t=e.toLowerCase().split(".").pop();return{png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",mp4:"video/mp4",m4v:"video/mp4",webm:"video/webm",mov:"video/quicktime",avi:"video/x-msvideo",flv:"video/x-flv"}[t??""]??"application/octet-stream"}function Dc(e,t){let n=e,r=Number(n.naturalWidth??n.width??0),o=Number(n.naturalHeight??n.height??0),i=r*o;t.toLowerCase().endsWith(".gif")?cc(i):lc(i)}async function Ig(e,t,n,r){if(e instanceof Uint8Array&&typeof createImageBitmap=="function"){let s=await createImageBitmap(new Blob([Et(e)],{type:t}));r.aborted&&(s.close(),r.throwIfAborted());try{Dc(s,n)}catch(l){throw s.close(),l}return{image:s,dispose:()=>s.close()}}let o=e instanceof Uint8Array?URL.createObjectURL(new Blob([Et(e)],{type:t})):null,i=new Image,a=()=>{i.removeAttribute("src"),o&&URL.revokeObjectURL(o)};try{return await new Promise((s,l)=>{let u=()=>{clearTimeout(m),i.onload=null,i.onerror=null,r.removeEventListener("abort",d)},c=()=>{u(),l(new Error("Image unavailable"))},d=()=>{u(),l(new DOMException("Aborted","AbortError"))},m=setTimeout(c,8e3);i.onload=()=>{i.naturalWidth>0?(u(),s()):c()},i.onerror=c,r.addEventListener("abort",d,{once:!0}),r.aborted?d():i.src=o??e.uri}),r.throwIfAborted(),Dc(i,n),{image:i,dispose:a}}catch(s){throw a(),s}}function Eg(e,t){return new Promise(n=>{let r=!1,o=l=>{r||(r=!0,clearTimeout(s),e.removeEventListener("loadeddata",i),e.removeEventListener("error",a),t.removeEventListener("abort",a),n(l))},i=()=>o(e.readyState>=2&&e.videoWidth>0),a=()=>o(!1),s=setTimeout(a,8e3);e.addEventListener("loadeddata",i),e.addEventListener("error",a),t.addEventListener("abort",a,{once:!0}),t.aborted?a():e.readyState>=2&&i()})}async function Hc(e){let{files:t,osuBytes:n,osuPath:r,signal:o,onWarning:i,onInvalidate:a}=e,s=rc(t,r),l=wc(fn(n),s.map(H=>H.text),{osuPath:r,osbPaths:s.map(H=>H.path),cancellation:{signal:o}}),u=l.objects,c=new Map,d=new Set,m=null,f=null,h=!1,p=!1,b=!1,S=!1,g=!1,v=0,x=!1,k={backgroundBrightness:e.dim===void 0?20:(1-e.dim)*100,backgroundBlur:0,storyboardEnabled:!0,videoEnabled:!0},M=null,y=null,w=null,T=NaN,C=0,E=new wr,R=Ko(u,l.samples),D=H=>H.replace(/\\/g,"/").toLowerCase(),_=()=>{T=NaN,!g&&!o.aborted&&a()},P=()=>{g||o.aborted||h||(h=!0,m?.pause(),i("\u89C6\u9891\u65E0\u6CD5\u64AD\u653E\uFF0C\u5DF2\u4FDD\u7559\u5176\u5B83\u8C31\u9762\u5185\u5BB9"),_())},U=()=>{g||(g=!0,S=!1,o.removeEventListener("abort",U),m&&(m.removeEventListener("seeked",_),m.removeEventListener("error",P),m.pause(),m.removeAttribute("src"),m.load()),f&&URL.revokeObjectURL(f),d.forEach(H=>H()),d.clear(),c.clear(),M&&(M.width=M.height=0),y&&(y.width=y.height=0),E.dispose(),_c())};o.addEventListener("abort",U,{once:!0});try{o.throwIfAborted();let H=[...new Set([...xc(u),...l.background?[l.background]:[]])];if(await un({items:H,concurrency:4,signal:o,failureMode:"throw",load:async L=>{let N=It(t,L);if(!N){i("\u90E8\u5206\u56FE\u7247\u7F3A\u5931\uFF0C\u5DF2\u4FDD\u7559\u5176\u5B83\u8C31\u9762\u5185\u5BB9");return}let O;try{O=await Ig(N.resource,Oc(L),L,o)}catch(W){if(W instanceof pn)throw W;o.aborted||i("\u90E8\u5206\u56FE\u7247\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u5DF2\u4FDD\u7559\u5176\u5B83\u8C31\u9762\u5185\u5BB9");return}g||o.aborted?O.dispose():(c.set(D(L),O.image),d.add(O.dispose))}}),o.throwIfAborted(),l.video){let L=It(t,l.video.file);if(L){let N=L.resource;f=N instanceof Uint8Array?URL.createObjectURL(new Blob([Et(N)],{type:Oc(l.video.file)})):null,m=document.createElement("video"),m.muted=!0,m.playsInline=!0,m.preload="auto",m.src=f??N.uri,m.load(),await Eg(m,o)?(m.addEventListener("seeked",_),m.addEventListener("error",P)):P()}else P()}o.throwIfAborted();let I=()=>{R=Ko(u,l.samples),m&&!h&&l.video&&Number.isFinite(m.duration)&&(R={startMs:Math.min(R.startMs,l.video.startMs),endMs:Math.max(R.endMs,l.video.startMs+m.duration*1e3)})};I();let B=l.background?c.get(D(l.background)):void 0,j=l.background?It(t,l.background):void 0,K=j&&u.some(L=>It(t,L.file)?.path===j.path),V=L=>c.get(D(L)),G=(L,N,O=!1)=>{if(!m||!l.video||h||g)return;let W=(L-l.video.startMs)/1e3;if(p=W>=0&&W<m.duration,S=N&&p&&k.videoEnabled,!p||!k.videoEnabled){m.pause();return}let Q=N&&!O?.15:.012;Math.abs(m.currentTime-W)>Q&&(!m.seeking||O)&&(m.currentTime=W),N?m.paused&&!b&&(b=!0,m.play().catch(se=>{!S||g||o.aborted||se instanceof DOMException&&se.name==="AbortError"||P()}).finally(()=>{b=!1})):m.pause()},F=(L,N)=>{if(k.videoEnabled&&m&&!h&&p&&m.readyState>=2)ni(L,m);else if(B&&(!k.storyboardEnabled||!K)){if(!M){M=document.createElement("canvas"),M.width=1280,M.height=720;let O=M.getContext("2d"),W=l.backgroundOffset;W&&O.translate(W.x*1.5,W.y*1.5),ni(O,B)}L.drawImage(M,0,0)}k.storyboardEnabled&&ri(L,u,N,bc,V,l.widescreen)};return{get range(){return R},visuals:l,capabilities:Object.freeze({storyboard:l.objects.length>0||l.samples.length>0,video:l.video!==null}),configure(L){if(g)return;let N=(Q,se,J)=>Number.isFinite(Q)?Math.max(0,Math.min(se,Q)):J,O={backgroundBrightness:N(L.backgroundBrightness,100,20),backgroundBlur:N(L.backgroundBlur,20,0),storyboardEnabled:L.storyboardEnabled,videoEnabled:L.videoEnabled};if(O.backgroundBrightness===k.backgroundBrightness&&O.backgroundBlur===k.backgroundBlur&&O.storyboardEnabled===k.storyboardEnabled&&O.videoEnabled===k.videoEnabled)return;let W=O.videoEnabled!==k.videoEnabled;k=O,W&&G(v,x,!0),_()},bindTriggers(L){u=Tc(l.objects,L),T=NaN,I()},sync(L,N,O=!1){v=L,x=N,O&&(T=NaN),G(L,N,O)},drawUnder(L,N){if(g)return;L.save(),k.backgroundBlur>0?(y||(y=document.createElement("canvas"),y.width=1280,y.height=720,w=y.getContext("2d")),T!==N&&(w.clearRect(0,0,1280,720),F(w,N),T=N,C++),E.draw(L,y,k.backgroundBlur,C)):F(L,N);let O=1-k.backgroundBrightness/100;O&&(L.fillStyle=`rgba(0,0,0,${O})`,L.fillRect(0,0,1280,720)),L.restore()},drawOver(L,N){!g&&k.storyboardEnabled&&ri(L,u,N,gc,V,l.widescreen)},dispose:U}}catch(H){throw U(),H}}var Z={navy:"#202833",ink:"#11161e",mint:"#8fcbd8",purple:"#b5b3dc",gold:"#ffd783",white:"#eef3f6",don:"#eb452c",kat:"#448dab"},Wc=Math.PI*2,Bc=720/768,Ag=720/480,Fc=610,Nc=256,Rg=32,dt={},_t=new Map,Lt=new Map,Ee=new Map;function be(e,t,n,r,o,i,a=2){e.beginPath(),e.arc(t,n,r,0,Wc),e.fillStyle=o,e.fill(),i&&(e.strokeStyle=i,e.lineWidth=a,e.stroke())}function Ue(e,t,n,r,o,i=2){e.beginPath(),e.arc(t,n,r,0,Wc),e.strokeStyle=o,e.lineWidth=i,e.stroke()}function Ce(e,t,n,r,o,i){e.fillStyle=i,e.fillRect(t,n,r,o)}async function oi(e){let t=new Map;try{for(let n of e){let r=n.density??2,o=n.width*r,i=n.height*r,a=typeof OffscreenCanvas=="function"?new OffscreenCanvas(o,i):Object.assign(document.createElement("canvas"),{width:o,height:i}),s=a.getContext("2d");if(!s)throw new Error("\u65E0\u6CD5\u51C6\u5907\u64AD\u653E\u753B\u9762");s.scale(r,r),n.paint(s);let l="transferToImageBitmap"in a?a.transferToImageBitmap():await createImageBitmap(a);t.set(`${n.stem}${r===2?"@2x":""}.png`,l)}return t}catch(n){for(let r of t.values())r.close();throw n}}function Pg(){let e=[],t=(r,o,i,a)=>e.push({stem:r,width:o,height:i,paint:a}),n=(r,o=2)=>e.push({stem:r,width:o,height:o,paint:()=>{},density:1});for(let r of["hitcircle","sliderstartcircle"])t(r,128,128,o=>{be(o,64,64,59,"#ffffff66")});for(let r of["hitcircleoverlay","sliderstartcircleoverlay"])t(r,128,128,o=>{Ue(o,64,64,57.5,Z.white,3)});t("approachcircle",128,128,r=>Ue(r,64,64,58,"#ffffff",2)),t("sliderb",128,128,r=>be(r,64,64,51,Z.white)),t("sliderfollowcircle",224,224,r=>Ue(r,112,112,99,"#ffffff40",2)),t("reversearrow",128,128,r=>Ue(r,64,64,27,Z.white,4)),t("sliderscorepoint",32,32,r=>be(r,16,16,5,Z.white)),t("followpoint",16,16,r=>be(r,8,8,2,"#ffffff66")),t("cursor",32,32,r=>be(r,16,16,11,Z.gold)),n("cursormiddle"),n("cursortrail"),t("spinner-bottom",360,360,r=>Ue(r,180,180,154,"#ffffff33",4)),t("spinner-top",360,360,r=>{r.beginPath(),r.arc(180,180,154,-Math.PI/2,Math.PI/6),r.strokeStyle=Z.white,r.lineWidth=4,r.stroke()}),t("spinner-middle2",100,100,()=>{}),t("spinner-circle",360,360,r=>Ue(r,180,180,154,"#ffffff99",3)),t("spinner-approachcircle",360,360,r=>Ue(r,180,180,164,Z.white,2)),t("spinner-metre",360,360,()=>{});for(let r of["spinner-background","spinner-glow","spinner-middle","spinner-spin","spinner-clear","spinner-warning","spinner-osu"])n(r,1);for(let r of["taikohitcircle","taikobigcircle"])t(r,128,128,o=>be(o,64,64,61,"#ffffff"));for(let r of["taikohitcircleoverlay","taikobigcircleoverlay"])t(r,128,128,o=>{Ue(o,64,64,60,Z.white,2)});t("taiko-roll-middle",8,128,r=>Ce(r,0,3,8,122,"#ffffff")),t("taiko-roll-end",64,128,r=>{r.beginPath(),r.arc(0,64,61,-Math.PI/2,Math.PI/2),r.closePath(),r.fillStyle="#ffffff",r.fill()}),t("taiko-bar-right",1280,200,r=>{Ce(r,0,0,1280,200,"#151a22eb"),Ce(r,0,0,1280,1,"#ffffff26"),Ce(r,0,199,1280,1,"#ffffff26")}),n("taiko-bar-right-glow"),t("taiko-bar-left",180,200,r=>{Ce(r,0,0,180,200,Z.ink),be(r,90,100,78,"#252d38","#737d89",2),be(r,90,100,50,"#151a22","#737d89",2),Ce(r,89.5,23,1,154,"#737d89")}),t("taiko-drum-inner",90,200,r=>be(r,90,100,48,Z.don)),t("taiko-drum-outer",90,200,r=>{be(r,90,100,76,Z.kat),r.globalCompositeOperation="destination-out",be(r,90,100,52,"#ffffff")}),t("taiko-barline",4,200,r=>Ce(r,1,0,1,200,"#ffffff26")),n("taiko-glow");for(let r of["taiko-hit300","taiko-hit300k","taiko-hit100","taiko-hit100k","taiko-hit0"])n(r);for(let r of["idle","kiai","fail","clear"])n("pippidon"+r);for(let r of["fruit-pear","fruit-grapes","fruit-apple","fruit-orange","fruit-drop","fruit-bananas"])t(r,128,128,o=>be(o,64,64,56,"#ffffff80","#ffffff",4)),n(r+"-overlay");for(let r of["idle","fail","kiai"])t("fruit-catcher-"+r,160,40,o=>{Ce(o,16,16,128,8,Z.white)});n("scoreboard-explosion-1"),n("scoreboard-explosion-2");for(let r of["default","score","combo","scoreentry"])for(let o of[..."0123456789","dot","percent","x","comma"])n(r+"-"+o,1);for(let r of["hit0","hit50","hit100","hit100k","hit300","hit300k","hit300g"])n(r);for(let r of["mania-hit0","mania-hit50","mania-hit100","mania-hit200","mania-hit300","mania-hit300g"])n(r,1);for(let r of["mania-stage-hint","mania-stage-bottom"])n(r);return e}function _g(e){let t=e*80-(e%2===1?10:0);return t>1280?1200/t:1}function jc(e,t,n){let r=[],o=new Set,i={keys:t,imageLookups:{},colours:[],coloursLight:[],keysUnderNotes:!0,judgementLine:!1,noteBodyStyle:0,columnLineWidth:Array.from({length:t+1},()=>.5),colourColumnLine:"#ffffff18",lightPosition:Fc/1.5,barlineHeight:0};n<1&&(i.columnWidth=[]);let a=(l,u,c,d)=>r.push({stem:l,width:u,height:c,paint:d}),s=e==="circle"?128:32;for(let l=0;l<t;l++){let u=t%2===1&&l===Math.floor(t/2),c=(u?70:80)*n;i.columnWidth?.push(c/Ag);let d=u?"center":Math.min(l,t-1-l)%2===0?"outer":"inner",m=d==="center"?Z.gold:d==="outer"?Z.white:Z.mint,f="builtin/"+e+"/"+d;i.colours.push(l%2===0?"#11161eee":"#171e27ee"),i.coloursLight.push(m);for(let[h,p]of[["noteimage","note"],["noteimageh","head"],["noteimaget","tail"],["noteimagel","body"],["keyimage","key"],["keyimaged","down"]]){let b=h==="noteimage"||h==="keyimage"?h+l:h.slice(0,-1)+l+h.slice(-1);i.imageLookups[b]=f+"-"+p}if(!o.has(d)){o.add(d);for(let h of["note","head","tail"])a(f+"-"+h,128,s,p=>{e==="circle"?be(p,64,64,54,m):Ce(p,5,5,118,22,m)});for(let h of[!1,!0])a(f+"-"+(h?"down":"key"),128,Nc,p=>{let b=c*s/128,S=Nc-(720-Fc+b/2)/Bc,g=c/128/Bc;p.save(),p.translate(64,S),p.scale(1,g),e==="circle"?h?be(p,0,0,54,m):Ue(p,0,0,54,m+"88",2):h?Ce(p,-59,-11,118,22,m):(p.strokeStyle=m+"88",p.lineWidth=2,p.strokeRect(-59,-11,118,22)),p.restore()})}}for(let l of["left","right"])a("mania-stage-"+l,8,720,u=>{Ce(u,l==="left"?5:1,0,1,720,"#ffffff33")});a("mania-stage-light",2,2,()=>{});for(let l of["lightingn","lightingl"])for(let u=0;u<4;u++)a(l+"-"+u,2,2,()=>{});return{specs:r,section:i}}function Lg(){if(!dt.promise){let e=oi(Pg());dt.promise=e,e.catch(()=>{dt.promise===e&&(dt.promise=void 0)})}return dt.promise}function Og(e,t){let n=`${e}:${t}`,r=_t.get(n);if(!r){r=oi(jc(e,5,t).specs),_t.set(n,r);let o=r;o.catch(()=>{_t.get(n)===o&&_t.delete(n)})}return r}function Dg(e,t){let n=`${e}:${t}`,r=Lt.get(n);if(!r){let o=(e==="circle"?108:118)*t/100;r=oi(["outer","inner","center"].map(a=>({stem:`builtin/${e}/${a}-body`,width:128,height:1,paint:s=>Ce(s,(128-o)/2,0,o,1,(a==="center"?Z.gold:a==="outer"?Z.white:Z.mint)+"70")}))),Lt.set(n,r);let i=r;i.catch(()=>{Lt.get(n)===i&&Lt.delete(n)})}return r}function ii(e,t=4,n=60){let r=Number.isFinite(t)?Math.max(1,Math.round(t)):4,o=Number.isFinite(n)?Math.max(10,Math.min(100,Math.round(n))):60,i=`${e}:${r}:${o}`,a=Ee.get(i);if(a)return Ee.delete(i),Ee.set(i,a),a;let s=_g(r),l=Lg(),u=Og(e,s),c=Dg(e,o);for(a=(async()=>{let[m,f,h]=await Promise.all([l,u,c]),{section:p}=jc(e,r,s);return{images:new Map([...m,...f,...h]),sounds:new Map,spinnerImages:new Map([...m].filter(([S])=>S.startsWith("spinner-"))),config:{name:"rRanker",version:"2.7",comboColors:[Z.mint,Z.purple,Z.gold,Z.white],hitCircleOverlap:0,hitCirclePrefix:"default",scorePrefix:"score",comboPrefix:"combo",sliderBorder:Z.white,sliderTrackOverride:Z.navy,allowSliderBallTint:!1,maniaSections:[p]}}})(),Ee.set(i,a);Ee.size>Rg;)Ee.delete(Ee.keys().next().value);let d=a;return d.catch(()=>{Ee.get(i)===d&&Ee.delete(i)}),a}async function Uc(){let e=[...Ee.values()],t=dt.promise,n=[..._t.values(),...Lt.values()];Ee.clear(),_t.clear(),Lt.clear(),dt.promise=void 0;let r=new Set;for(let o of await Promise.allSettled(e))if(o.status==="fulfilled")for(let i of o.value.images.values())r.add(i);if(t){let o=await t.catch(()=>{});if(o)for(let i of o.values())r.add(i)}for(let o of await Promise.allSettled(n))if(o.status==="fulfilled")for(let i of o.value.values())r.add(i);for(let o of r)o.close()}var $c=we({}).maniaSkin;function ai(e){return we({maniaSkin:e}).maniaSkin}async function Vc(e){let{ctx:t,files:n,osuPath:r,signal:o,onWarning:i}=e,a=new Map,s=new Map,l=new Map,u=(b,S=r)=>{let g=nc(n,b,S);if(!g)return;let v=g.path.toLowerCase();return s.set(v,g.bytes),v},c=e.songName?u(e.songName):void 0;e.songName&&!c&&i("\u6B4C\u66F2\u97F3\u9891\u7F3A\u5931\uFF0C\u4ECD\u53EF\u89C2\u770B\u8C31\u9762");for(let b of e.schedule){let S=b.type==="combobreak"||b.type==="spinnerbonus"?["wav","mp3","ogg"].map(v=>`${b.type}.${v}`):zo(b.type,b.sampleSet,b.sampleIndex,b.customFile,e.mode),g=!1;for(let v of S){let x=u(v);x&&(l.set(v.replace(/\\/g,"/").toLowerCase(),x),g=!0)}!g&&b.customFile&&b.customFile!=="catch-banana"&&i("\u90E8\u5206\u8C31\u9762\u97F3\u6548\u7F3A\u5931\uFF0C\u5DF2\u4F7F\u7528\u5185\u7F6E\u97F3\u6548")}let d=e.samples.map(b=>u(b.file,""));d.some(b=>!b)&&i("\u90E8\u5206\u6545\u4E8B\u677F\u97F3\u6548\u7F3A\u5931\uFF0C\u5DF2\u4FDD\u7559\u5176\u5B83\u8C31\u9762\u5185\u5BB9"),await un({items:[...s],concurrency:3,signal:o,failureMode:"throw",load:async([b,S])=>{try{let g=await t.decodeAudioData(Et(S));o.aborted||a.set(b,g)}catch{o.aborted||i(b===c?"\u6B4C\u66F2\u97F3\u9891\u65E0\u6CD5\u64AD\u653E\uFF0C\u4ECD\u53EF\u89C2\u770B\u8C31\u9762":"\u90E8\u5206\u97F3\u6548\u65E0\u6CD5\u64AD\u653E\uFF0C\u5DF2\u4FDD\u7559\u5176\u5B83\u8C31\u9762\u5185\u5BB9")}}}),o.throwIfAborted();let m=new Map;l.forEach((b,S)=>{let g=a.get(b);g&&m.set(S,g)});let f=[],h=0;e.samples.forEach((b,S)=>{let g=d[S],v=g?a.get(g):void 0;v&&(h=Math.max(h,b.timeMs+v.duration*1e3),b.layer!=="Fail"&&f.push({timeMs:b.timeMs,volume:b.volume,buffer:v}))});let p={mode:e.mode,skinSounds:m,synthCache:new Map,ctx:t};for(let b of e.schedule){let S=b.type==="combobreak"||b.type==="spinnerbonus"?dn(m,b.type):mr(b.type,b.sampleSet,b.sampleIndex,b.customFile,p);S&&(h=Math.max(h,b.beatmapMs+S.duration*1e3))}return{song:c?a.get(c)??null:null,sounds:m,samples:f,endMs:h}}function Xc(e,t,n,r=0){let o=0;for(let s of e.hitObjects){let l=s.type==="spinner"?s.endTime:s.type==="slider"?s.time+le(e,s)*s.slides:s.time;o=Math.max(o,l)}for(let s of e.maniaHolds)o=Math.max(o,s.endTime);let i=Math.min(0,n.startMs,-Math.max(0,e.audioLeadIn)),a=Math.max(o+1e3,t??0,n.endMs,r,1e3);return{startMs:i,endMs:a,durationMs:a-i}}var si=we({}).maniaScrollSpeed;function li(e){return we({maniaScrollSpeed:e}).maniaScrollSpeed}function Ot(e){let{maniaSkin:t,maniaScrollSpeed:n,...r}=we(e);return r}var j1=Object.freeze(Ot({}));var Hg=null,ci=null,mt=null;function ui(){return Hg??(Hg=new AudioContext)}function zc(e,t,n,r,o){return eo(o),new ln(e,n,t,Bg(o,n.mode),r)}function Bg(e,t){if(t!==0)return e;let n=e.images.get("hit300.png");if(!n||n.width<=1||n.height<=1)throw new Error("\u65E0\u6CD5\u51C6\u5907\u64AD\u653E\u753B\u9762");let r=new Map(e.images);for(let o of["cursor","cursormiddle","cursortrail"])r.set(`${o}.png`,n),r.set(`${o}@2x.png`,n);return{...e,images:r}}var di=class{constructor(t,n,r,o,i,a,s,l,u,c,d={}){this.canvas=t;this.beatmap=n;this.replay=r;this.modDiff=o;this.renderer=i;this.audioSync=a;this.media=s;this.range=l;this.controller=u;this.skin=c;A(this,"loop",new Mn);A(this,"clock",new cn);A(this,"playing",!1);A(this,"ended",!1);A(this,"disposed",!1);A(this,"positionMs",0);A(this,"frame",null);A(this,"command",0);A(this,"skinRequest",0);A(this,"mediaTime",0);A(this,"settings",Ot({}));A(this,"skinVariant",$c);A(this,"renderedSkinVariant",this.skinVariant);A(this,"tick",()=>{if(this.frame=null,this.disposed||!this.playing)return;let t=this.loop.target(this.currentTimeMs);if(t!==null){this.playFrom(t);return}if(this.currentTimeMs>=this.range.durationMs){this.pause(),this.positionMs=this.range.durationMs,this.ended=!0,this.clock.setOffset(this.range.endMs/1e3),this.draw(!0);return}this.draw(),this.frame=requestAnimationFrame(this.tick)});this.settings=Ot(d.settings),this.skinVariant=ai(d.maniaSkin),this.renderedSkinVariant=this.skinVariant,this.configureRenderer(),this.renderer.options.maniaScrollSpeed=li(d.maniaScrollSpeed??si),this.clock.setOffset(l.startMs/1e3),this.draw(!0)}configureRenderer(){Object.assign(this.renderer.options,{showFollowpoints:!0,maniaScrollSpeed:si,backdropOverlay:t=>this.media.drawUnder(t,this.mediaTime),hudOverlay:(t,n)=>{this.media.drawOver(t,this.mediaTime),this.replay.mode===0&&Qt(t,this.replay,n,this.skin)}}),this.applySettings()}applySettings(){this.media.configure(this.settings),this.audioSync.setStoryboardEnabled(this.settings.storyboardEnabled),Object.assign(this.renderer.options,{maniaIgnoreSV:this.settings.maniaIgnoreSV,maniaTrackOpacity:this.settings.maniaTrackOpacity/100,taikoTrackOpacity:this.settings.taikoTrackOpacity/100})}async setSettings(t){if(this.disposed)return;let n=this.settings.holdWidth;this.settings=Ot({...this.settings,...t}),this.applySettings(),this.beatmap.mode===3&&n!==this.settings.holdWidth&&await this.refreshSkin(),this.playing||this.draw()}get currentTimeMs(){if(!this.playing)return this.positionMs;let t=this.clock.positionAt(Vo(ui()))*1e3;return Math.max(0,Math.min(this.range.durationMs,t-this.range.startMs))}draw(t=!1){this.disposed||(this.mediaTime=this.range.startMs+this.currentTimeMs,this.media.sync(this.mediaTime,this.playing,t),this.renderer.renderFrameAt(this.mediaTime+this.renderer.options.audioOffsetMs-this.renderer.oldOffsetMs))}async playFrom(t){if(this.disposed)return;this.pause();let n=++this.command;if(this.positionMs=Math.max(0,Math.min(t,this.range.durationMs)),this.positionMs=this.loop.target(this.positionMs)??this.positionMs,this.positionMs>=this.range.durationMs&&(this.positionMs=0),await this.audioSync.playFrom(this.positionMs),this.disposed||n!==this.command)return;let r=ui();this.clock.set(r.currentTime,(this.range.startMs+this.audioSync.currentTimeMs)/1e3,1),this.playing=!0,this.ended=!1,this.draw(!0),this.frame=requestAnimationFrame(this.tick)}pause(){this.command++,this.positionMs=this.currentTimeMs,this.playing=!1,this.audioSync.pause(),this.clock.setOffset((this.range.startMs+this.positionMs)/1e3),this.frame!==null&&cancelAnimationFrame(this.frame),this.frame=null,this.media.sync(this.range.startMs+this.positionMs,!1,!0)}async seek(t,n=this.playing){this.disposed||(this.pause(),this.positionMs=Math.max(0,Math.min(t,this.range.durationMs)),this.ended=this.positionMs>=this.range.durationMs,this.clock.setOffset((this.range.startMs+this.positionMs)/1e3),this.draw(!0),n&&(!this.ended||this.loop.target(this.positionMs)!==null)&&await this.playFrom(this.loop.target(this.positionMs)??this.positionMs))}async setSkin(t){this.beatmap.mode!==3||this.disposed||(this.skinVariant=t,await this.refreshSkin())}async refreshSkin(){let t=++this.skinRequest,n=this.skinVariant,r=await ii(n,Math.max(1,Math.round(this.beatmap.circleSize)),this.settings.holdWidth);if(this.disposed||t!==this.skinRequest)return;if(n===this.renderedSkinVariant){for(let[s,l]of r.images)/-body(?:@2x)?\.png$/.test(s)&&this.skin.images.set(s,l);this.playing||this.draw();return}let o={...r,images:new Map(r.images)},i={...this.renderer.options},a=zc(this.canvas,this.beatmap,this.replay,this.modDiff,o);this.renderer=a,this.skin=o,this.renderedSkinVariant=n,Object.assign(a.options,i),this.playing||this.draw()}destroy(){this.disposed||(this.pause(),this.disposed=!0,this.skinRequest++,this.controller.abort(),this.audioSync.destroy(),this.media.dispose())}};function xr(){mt?.abort(),mt=null,ci?.session.destroy(),ci=null}async function Gc(e,t,n,r=()=>{},o={}){xr();let i=new AbortController;mt=i;let a=i.signal,s=m=>{a.aborted||r(m)},l=null,u=null,c=null,d=null;try{let m=ui();a.throwIfAborted();let f=hr(n.bytes);if(![0,1,2,3].includes(f.mode))throw new Error("unsupported-mode");f.rawOsu=n.bytes;let h=await dc(f,n.hash,a),p=Ut(f,h);Pr(f);let b=await ii(ai(o.maniaSkin),f.mode===3?Math.max(1,Math.round(f.circleSize)):4,Ot(o.settings).holdWidth),S={...b,images:new Map(b.images)};a.throwIfAborted(),u=zc(e,f,h,p,S);let g=Ql({mode:f.mode,beatmap:f,hitResults:u.hitResults,maniaSamples:u.maniaSamples,taikoGhostTaps:u.taikoGhostTaps,comboFrames:u.comboFrames,oldOffsetMs:u.oldOffsetMs,fromBeatmapMs:-1/0});l=await Hc({files:t,osuBytes:n.bytes,osuPath:n.path,signal:a,onWarning:s,onInvalidate:()=>d?.draw()}),l.bindTriggers(Zl(g));let v=await Vc({ctx:m,files:t,osuPath:n.path,songName:f.audioFilename,mode:f.mode,schedule:g,samples:l.visuals.samples,signal:a,onWarning:s});a.throwIfAborted();let x=Xc(f,v.song?v.song.duration*1e3:null,l.range,v.endMs);c=new fr({ctx:m,songBuffer:v.song,skinSounds:S.sounds,mergedSounds:v.sounds,beatmapHitsounds:!0,introOffsetMs:x.startMs,mode:f.mode,schedule:g,extraSamples:v.samples}),d=new di(e,f,h,p,u,c,l,x,i,S,o);let k={session:d,durationMs:x.durationMs,media:l};return ci=k,mt===i&&(mt=null),k}catch(m){throw i.abort(),c?.destroy(),l?.dispose(),mt===i&&(mt=null),m}}function Yc(e,t){e.renderer.options.maniaScrollSpeed=li(t),e.playing||e.draw()}async function Mr(e,t){await e.playFrom(t)}function gn(e){e.pause(),e.draw()}async function Tr(e,t,n){await e.seek(t,n)}function Dt(e){return e.currentTimeMs}var Y=e=>document.getElementById(e),Fg=Y("playfield"),Jc=Y("play-button"),Zc=Y("btn-fullscreen"),Ke=Y("fs-lock"),Je=Y("timeline-host"),Ng=Y("controls"),hi=new ur({host:Je,bars:Y("timeline-bars"),ruler:Y("timeline-ruler"),playhead:Y("timeline-playhead"),badge:Y("timeline-badge")}),Kc=new Set,bi=[],Qc,re=we({}),z=null,oe=!1,q=new Ve(()=>oe),Ft=!1,eu=!1,Sn=!1,qe=!1,mi=!0,yn=0,qc=-1/0;function Bt(e,t={}){oe||window.ReactNativeWebView?.postMessage(JSON.stringify({type:e,...t}))}function Ze(e){oe||(Y("status").textContent=e)}function Wg(e){oe||(Kc.add(e),Y("media-notice").textContent=[...Kc].join("\uFF1B"))}function Ht(e){let t=Math.max(0,Math.floor(e/1e3));return`${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`}function Nt(){if(!z||oe)return;let e=z.session.playing,t=Dt(z.session),n=Math.min(100,Math.max(0,t/z.durationMs*100));Y("play-icon").innerHTML=e?'<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>':'<path d="M8 5v14l11-7z"/>',Jc.setAttribute("aria-label",e?"\u6682\u505C":"\u64AD\u653E"),Y("time-label").textContent=`${Ht(t)} / ${Ht(z.durationMs)}`,hi.updateProgress(n,Ht(t)),Je.setAttribute("aria-valuenow",String(Math.round(t))),Je.setAttribute("aria-valuetext",`${Ht(t)} / ${Ht(z.durationMs)}`),z.session.ended&&Ze("\u64AD\u653E\u7ED3\u675F")}function tu(e){yn=0,!oe&&((e-qc>=100||!z?.session.playing)&&(Nt(),qc=e),z?.session.playing&&(yn=requestAnimationFrame(tu)))}function gi(){if(oe||!z)return;let e=z.session.beatmap,t=z.session.range.startMs;hi.build(z.durationMs,[{times:[...e.hitObjects,...e.maniaHolds].map(n=>n.time-t)}],Kl(z.durationMs,Ht)),Nt()}var nu=new ResizeObserver(gi);nu.observe(Je);q.own(()=>nu.disconnect());q.own(()=>cancelAnimationFrame(yn));q.own(xr);function jg(){Ng.classList.toggle("hidden",!mi||qe),Ke.classList.toggle("hidden",!mi)}var ru=xi(q,{active:()=>Sn,render:e=>{mi=e,jg()}});function vn(){ru.show()}function Ug(){ru.hide()}function Cr(e){oe||(ft(),Sn=e,Gl(e),Zc.setAttribute("aria-label",e?"\u9000\u51FA\u5168\u5C4F":"\u8FDB\u5165\u5168\u5C4F"),e||(qe=!1,Ke.classList.remove("locked"),Ke.setAttribute("aria-label","\u9501\u5B9A"),Ke.setAttribute("aria-pressed","false")),vn(),Bt("fullscreen",{active:e}))}function fi(){Bt("settings",{settings:{...re}})}function pi(e){let t=re.maniaSkin;re=we({...re,...e});let n=z;!n||oe||(Yc(n.session,re.maniaScrollSpeed),n.session.setSettings(re).catch(()=>{n===z&&!oe&&Ze("\u8BBE\u7F6E\u6682\u65F6\u65E0\u6CD5\u5E94\u7528\uFF0C\u8BF7\u91CD\u8BD5")}),re.maniaSkin!==t&&n.session.setSkin(re.maniaSkin).catch(()=>{n===z&&!oe&&Ze("\u6837\u5F0F\u6682\u65F6\u65E0\u6CD5\u5207\u6362\uFF0C\u8BF7\u91CD\u8BD5")}))}function $g(e){let t=(r,o,i,a,s,l,u)=>{let c=o==="maniaSkin"?+(re.maniaSkin==="circle"):re[o],d=Ei(Y(`${r}-trigger`),Y(`${r}-popup`),Y(`${r}-wheel`),Y(`${r}-list`),Y(`${r}-val`),m=>{pi({[o]:o==="maniaSkin"?m===1?"circle":"brick":m})},fi,i,a,s,c,u,l);return bi.push(d),q.own(d.dispose),d},n=r=>`${r}%`;t("brightness","backgroundBrightness",0,100,1,n),t("blur","backgroundBlur",0,20,1,r=>`${r} px`),e===3&&(t("mania-skin","maniaSkin",0,1,1,String,["\u7816\u5757","\u5706\u5708"]),Qc=t("scroll-speed","maniaScrollSpeed",1,40,.1,r=>r.toFixed(1)),t("hold-width","holdWidth",10,100,1,n),t("mania-track-opacity","maniaTrackOpacity",0,100,1,n)),e===1&&t("taiko-track-opacity","taikoTrackOpacity",0,100,1,n);for(let[r,o]of[["storyboard-enabled","storyboardEnabled"],["video-enabled","videoEnabled"],["mania-ignore-sv","maniaIgnoreSV"]]){let i=Y(r);i.setAttribute("aria-pressed",String(re[o])),q.listen(i,"click",()=>{pi({[o]:!re[o]}),i.setAttribute("aria-pressed",String(re[o])),fi()})}}async function Wt(e){let t=z;if(!(!t||oe)){try{if(await e(t.session),t!==z||oe)return;Ze(t.session.ended?"\u64AD\u653E\u7ED3\u675F":t.session.playing?"\u6B63\u5728\u64AD\u653E":"\u5DF2\u6682\u505C")}catch{if(t!==z||oe)return;gn(t.session),Ze("\u64AD\u653E\u6682\u65F6\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5")}Nt(),cancelAnimationFrame(yn),t.session.playing&&(yn=requestAnimationFrame(tu)),vn()}}function ou(){Wt(e=>e.playing?gn(e):Mr(e,Dt(e)))}function iu(){if(!oe){Ft=!1;for(let e of bi)e.flush();ft(),z&&(gn(z.session),Ze("\u5DF2\u6682\u505C"),Nt())}}function au(){if(!oe){for(let e of bi)e.flush();ft(),Sn&&Cr(!1),oe=!0,q.dispose(),z=null,delete window.__OSU_PREVIEW_AUDIO__,delete window.__OSU_CHART_PREVIEW_CONFIG__,Uc().catch(()=>{})}}q.listen(Jc,"click",ou);q.listen(Y("btn-restart"),"click",()=>{Wt(e=>Mr(e,0))});for(let[e,t]of[["btn-step-back",-5e3],["btn-step-forward",5e3]])q.listen(Y(e),"click",()=>void Wt(n=>Tr(n,Dt(n)+t,n.playing)));q.listen(Zc,"click",()=>Cr(!Sn));q.listen(Ke,"click",e=>{e.stopPropagation();let t=Mi(qe);qe=t.locked,Ke.classList.toggle("locked",qe),Ke.setAttribute("aria-label",t.actionLabel),Ke.setAttribute("aria-pressed",String(qe)),t.overlayHidden?Ug():vn()});q.listen(Y("app"),"scroll",ft,{passive:!0});function su(e){let t=Je.getBoundingClientRect(),n=Math.min(1,Math.max(0,(e.clientX-t.left)/Math.max(1,t.width)));Wt(r=>Tr(r,n*r.range.durationMs,!1))}q.listen(Je,"pointerdown",e=>{!z||qe||(e.preventDefault(),e.stopPropagation(),Ft=!0,eu=z.session.playing,gn(z.session),su(e))});q.listen(document,"pointermove",e=>{Ft&&su(e)});q.listen(document,"pointerup",()=>{Ft&&(Ft=!1,eu?Wt(e=>Mr(e,Dt(e))):vn())});q.listen(document,"pointercancel",()=>{Ft=!1,Nt(),vn()});q.listen(window,"resize",()=>{ft(),gi()});q.listen(window,"keydown",e=>{if(e.code==="Escape"&&Sn){e.preventDefault(),Cr(!1);return}if(!qe){if((e.code==="F3"||e.code==="F4")&&z?.session.beatmap.mode===3){e.preventDefault(),pi({maniaScrollSpeed:re.maniaScrollSpeed+(e.code==="F4"?1:-1)}),Qc?.setValue(re.maniaScrollSpeed),fi();return}e.target instanceof HTMLElement&&(e.target.closest('[role="listbox"]')||/^(INPUT|BUTTON|TEXTAREA|SELECT)$/.test(e.target.tagName))||(e.code==="Space"&&(e.preventDefault(),ou()),(e.code==="ArrowLeft"||e.code==="ArrowRight"||e.code==="Home"||e.code==="End")&&(e.preventDefault(),Wt(t=>Tr(t,e.code==="Home"?0:e.code==="End"?t.range.durationMs:Dt(t)+(e.code==="ArrowRight"?5e3:-5e3),t.playing))))}});function lu(e){Ci(e.data,{pause:iu,exitFullscreen:()=>Cr(!1),dispose:au})}q.listen(window,"message",lu);q.listen(document,"message",e=>lu(e));q.listen(window,"pagehide",au);q.listen(document,"visibilitychange",()=>{document.hidden&&iu()});async function Vg(){let e=window.__OSU_CHART_PREVIEW_CONFIG__;if(!e)throw new Error("missing-config");document.documentElement.dataset.theme=e.theme,q.own(Yl({sections:["\u753B\u9762\u8BBE\u7F6E","\u8F85\u52A9\u9009\u9879"]})),re=we(e.settings),Bt("progress",{value:.05,label:"\u6B63\u5728\u51C6\u5907\u64AD\u653E\u5668\u2026"});let t=new Map;for(let c of e.files)c.text!==void 0?t.set(c.path,new TextEncoder().encode(c.text)):c.uri&&t.set(c.path,{uri:c.uri});e.files=[];let n=window.__OSU_PREVIEW_AUDIO__??{};for(let c of Object.keys(n)){let d=atob(n[c]);delete n[c];let m=new Uint8Array(d.length);for(let f=0;f<d.length;f++)m[f]=d.charCodeAt(f);t.set(c,m)}delete window.__OSU_PREVIEW_AUDIO__;let r=t.get(e.chartPath);if(!(r instanceof Uint8Array))throw new Error("missing-chart");Bt("progress",{value:.2,label:"\u6B63\u5728\u51C6\u5907\u97F3\u753B\u2026"});let o=await Gc(Fg,t,{path:e.chartPath,bytes:r,hash:Rr(r)},Wg,{settings:re,maniaSkin:re.maniaSkin,maniaScrollSpeed:re.maniaScrollSpeed});if(t.clear(),delete window.__OSU_CHART_PREVIEW_CONFIG__,oe){o.session.destroy();return}z=o;let i=o.session.beatmap,a=i.mode,s=["osu!standard","osu!taiko","osu!catch","osu!mania"];vi(e.title||i.title||"osu!",{value:"\u2014",background:"#AAAAAA",text:"#FFFFFF",...e.previewDifficulty,label:e.previewDifficulty?.label||i.version}),a!==e.requestedMode&&(Y("mode-notice").textContent=`\u5F53\u524D\u6761\u76EE\u4E3A\u8F6C\u8C31\uFF0C\u6B63\u5728\u6309\u539F\u751F ${s[a]} \u6A21\u5F0F\u64AD\u653E\u3002`);for(let c of document.querySelectorAll("[data-mode]"))c.hidden=Number(c.dataset.mode)!==a;$g(a),Y("storyboard-enabled").hidden=!o.media.capabilities.storyboard,Y("video-enabled").hidden=!o.media.capabilities.video;for(let c of document.querySelectorAll("input,button,select"))c.disabled=!1;Je.setAttribute("aria-disabled","false"),Je.setAttribute("aria-valuemax",String(o.durationMs));let l=z.session,u=z.durationMs;wi(q,{loop:l.loop,position:()=>l.currentTimeMs,percent:c=>u>0?c/u*100:0,format:c=>(c/1e3).toFixed(2)+"s",update:(c,d)=>hi.updateLoop(c,d)}),gi(),Ze("\u5DF2\u5C31\u7EEA"),Nt(),Bt("ready")}Vg().catch(e=>{oe||(xr(),Ze("\u65E0\u6CD5\u64AD\u653E\u8FD9\u5F20\u8C31\u9762\uFF0C\u8BF7\u8FD4\u56DE\u91CD\u8BD5"),Bt("error",{message:"\u65E0\u6CD5\u64AD\u653E\u8FD9\u5F20\u8C31\u9762\uFF0C\u8BF7\u8FD4\u56DE\u91CD\u8BD5",diagnostic:e instanceof Error?e.stack:void 0}))});})();
