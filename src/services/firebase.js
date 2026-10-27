/*
 * This file is part of FlowAutomate.
 *
 * Copyright © 2026 midra001
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FlowAutomate is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * FlowAutomate is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with FlowAutomate. If not, see <https://www.gnu.org/licenses/>.
 *
 * @author midra001
 * @since 2026-09-26
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD9MAj5XBeF7d_wA2wb9teId1dOZ7athpw",
  authDomain: "flow-automate-94943.firebaseapp.com",
  projectId: "flow-automate-94943",
  storageBucket: "flow-automate-94943.firebasestorage.app",
  messagingSenderId: "711390990886",
  appId: "1:711390990886:web:3053d7f4f3de6ea5bb0ce7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);